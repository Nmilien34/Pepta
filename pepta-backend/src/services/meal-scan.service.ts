import {
  mealLogScanDetailResponseSchema,
  mealScanResponseSchema,
  type MealScanAnalysis,
  type MealScanCoachContent,
  type MealScanInput,
  type MealVoiceInput,
} from "@pepta/shared";
import { randomUUID } from "node:crypto";
import { isValidObjectId } from "mongoose";
import { addUtcDays, startOfUtcDay, startOfUtcWeek } from "../lib/dates";
import { AppError, NotFoundError } from "../lib/errors";
import { logger } from "../lib/logger";
import {
  MealLogModel,
  MealScanModel,
  ProteinLogModel,
  UserProfileModel,
  type MealScanDocument,
} from "../models";
import {
  generateMealScanNote,
  type MealScanProteinSnapshot,
} from "./meal-scan-note.service";
import {
  generateMealTextAnalysis,
  MEAL_SCAN_TEXT_ENGINE_VERSION,
} from "./meal-scan-text.service";
import {
  generateMealScanVision,
  MEAL_SCAN_VISION_ENGINE_VERSION,
} from "./meal-scan-vision.service";
import { createPresignedGetUrl, putS3Object } from "./s3.service";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MEAL_SCAN_COACH_COPY_VERSION = "meal-scan-coach-v1";
const MIN_PROTEIN_AFFIRMATION_GRAMS = 25;

interface DuplicateKeyError extends Error {
  code?: number;
  keyPattern?: Record<string, unknown>;
}

function invalidImage(message: string): AppError {
  return new AppError({
    code: "INVALID_IMAGE",
    message,
    statusCode: 400,
    details: { retryable: false },
  });
}

function storageFailed(): AppError {
  return new AppError({
    code: "MEAL_SCAN_STORAGE_FAILED",
    message: "Meal scan photo storage failed",
    statusCode: 503,
    details: { retryable: true },
    expose: true,
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function imageExtension(
  mimeType: MealScanInput["imageMimeType"],
): "jpg" | "png" | "webp" {
  if (mimeType === "image/png") {
    return "png";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  return "jpg";
}

export function buildMealScanObjectKey(
  userId: string,
  imageMimeType: MealScanInput["imageMimeType"],
  uploadId = randomUUID(),
): string {
  return `pepta/meal-scans/${userId}/${uploadId}.${imageExtension(imageMimeType)}`;
}

function isDuplicateIdempotencyError(
  error: unknown,
): error is DuplicateKeyError {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as DuplicateKeyError;
  return (
    candidate.code === 11000 && Boolean(candidate.keyPattern?.idempotencyKey)
  );
}

function decodeAndValidateImage(
  imageData: string,
  imageMimeType: MealScanInput["imageMimeType"],
): Buffer {
  const normalized = imageData.trim();
  if (
    !normalized ||
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)
  ) {
    throw invalidImage("imageData must be valid base64");
  }

  const bytes = Buffer.from(normalized, "base64");
  if (bytes.length === 0) {
    throw invalidImage("imageData must decode to a non-empty image");
  }

  if (bytes.length > MAX_IMAGE_BYTES) {
    throw invalidImage("Meal scan image must be 10 MB or smaller");
  }

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const isWebp =
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP";

  if (imageMimeType === "image/jpeg" && !isJpeg) {
    throw invalidImage("imageData must be a JPEG image");
  }

  if (imageMimeType === "image/png" && !isPng) {
    throw invalidImage("imageData must be a PNG image");
  }

  if (imageMimeType === "image/webp" && !isWebp) {
    throw invalidImage("imageData must be a WebP image");
  }

  return bytes;
}

function buildCoachContent(analysis: MealScanAnalysis): MealScanCoachContent {
  if (analysis.protein >= MIN_PROTEIN_AFFIRMATION_GRAMS) {
    return {
      mode: "affirmation",
      callout: `${analysis.foodName} looks like a helpful protein anchor. Confirm the estimate before saving it to your log.`,
      swap: null,
      copyVersion: MEAL_SCAN_COACH_COPY_VERSION,
    };
  }

  const additionalProtein = roundOne(
    MIN_PROTEIN_AFFIRMATION_GRAMS - analysis.protein,
  );
  const additionalCalories = Math.max(80, Math.round(additionalProtein * 8));

  return {
    mode: "swap",
    callout: `${analysis.foodName} may be light on protein. A small lean-protein add-on could make this meal more protective.`,
    swap: {
      description: `Add about ${additionalProtein}g protein from Greek yogurt, eggs, chicken, tofu, or a shake.`,
      additionalProtein,
      additionalCalories,
      adjustedMacros: {
        protein: roundOne(analysis.protein + additionalProtein),
        calories: roundOne(analysis.calories + additionalCalories),
        carbs: analysis.carbs,
        fat: analysis.fat,
        fiber: analysis.fiber,
      },
    },
    copyVersion: MEAL_SCAN_COACH_COPY_VERSION,
  };
}

function fallbackNote(
  analysis: MealScanAnalysis,
  snapshot?: MealScanProteinSnapshot,
): string {
  if (!snapshot) {
    return `Review this ${analysis.foodName} estimate before logging.`;
  }

  return `This would put you at ${snapshot.projectedProtein}g of ${snapshot.todayProteinTarget}g protein today. Review this estimate before logging.`;
}

async function computeProteinSnapshot(input: {
  userId: string;
  capturedAt: Date;
  analysis: MealScanAnalysis;
}): Promise<{ snapshot: MealScanProteinSnapshot; biggestWorry?: string }> {
  const profile = await UserProfileModel.findOne({ userId: input.userId });

  if (!profile?.dailyProteinTargetGrams || !profile?.dailyCalorieTarget) {
    throw new AppError({
      code: "BAD_REQUEST",
      message: "Complete nutrition targets before scanning meals",
      statusCode: 400,
    });
  }

  const todayStart = startOfUtcDay(input.capturedAt);
  const tomorrowStart = addUtcDays(todayStart, 1);
  const weekStart = startOfUtcWeek(input.capturedAt);
  const elapsedWeekDays =
    Math.floor(
      (todayStart.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000),
    ) + 1;
  const [todayMeals, todayProteins, weekMeals, weekProteins] =
    await Promise.all([
      MealLogModel.find({
        userId: input.userId,
        datetime: { $gte: todayStart, $lt: tomorrowStart },
      }),
      ProteinLogModel.find({
        userId: input.userId,
        datetime: { $gte: todayStart, $lt: tomorrowStart },
      }),
      MealLogModel.find({
        userId: input.userId,
        datetime: { $gte: weekStart, $lt: tomorrowStart },
      }),
      ProteinLogModel.find({
        userId: input.userId,
        datetime: { $gte: weekStart, $lt: tomorrowStart },
      }),
    ]);
  const todayProteinLogged =
    todayMeals.reduce((sum, meal) => sum + meal.protein, 0) +
    todayProteins.reduce((sum, log) => sum + log.grams, 0);
  const weekProteinLogged =
    weekMeals.reduce((sum, meal) => sum + meal.protein, 0) +
    weekProteins.reduce((sum, log) => sum + log.grams, 0);
  const projectedProtein = todayProteinLogged + input.analysis.protein;
  const projectedRatio = projectedProtein / profile.dailyProteinTargetGrams;

  return {
    snapshot: {
      todayProteinLogged: roundOne(todayProteinLogged),
      todayProteinTarget: profile.dailyProteinTargetGrams,
      todayPercent: Math.round(
        (todayProteinLogged / profile.dailyProteinTargetGrams) * 100,
      ),
      projectedProtein: roundOne(projectedProtein),
      projectedPercent: Math.round(projectedRatio * 100),
      weekAdherence: Math.round(
        (weekProteinLogged /
          (profile.dailyProteinTargetGrams * elapsedWeekDays)) *
          100,
      ),
      calorieTarget: profile.dailyCalorieTarget,
      mode: projectedRatio >= 0.8 ? "affirmation" : "swap",
    },
    biggestWorry: profile.biggestWorry,
  };
}

async function resolveTrackerNote(input: {
  analysis: MealScanAnalysis;
  snapshot: MealScanProteinSnapshot;
  biggestWorry?: string;
}): Promise<string> {
  try {
    const generated = await generateMealScanNote(
      input.analysis,
      input.snapshot,
      {
        biggestWorry: input.biggestWorry,
      },
    );

    if (generated) {
      return generated;
    }
  } catch (error) {
    logger.warn({ error }, "[meal-scan] note generation failed");
  }

  return fallbackNote(input.analysis, input.snapshot);
}

function toPlainValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toPlainValue);
  }

  if (value && typeof value === "object") {
    const maybeDocument = value as { toObject?: unknown };
    if (typeof maybeDocument.toObject === "function") {
      return toPlainValue(maybeDocument.toObject());
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        toPlainValue(entry),
      ]),
    );
  }

  return value;
}

function toPlainRecord(value: unknown): Record<string, unknown> {
  const plain = toPlainValue(value);
  return plain && typeof plain === "object"
    ? (plain as Record<string, unknown>)
    : {};
}

function serializeScan(scan: MealScanDocument | Record<string, unknown>) {
  const value = toPlainRecord(scan);

  const analysis = value.analysis as MealScanAnalysis | null | undefined;
  if (!analysis) {
    throw new AppError({
      code: "MEAL_SCAN_INCOMPLETE",
      message: "Meal scan is not complete",
      statusCode: 409,
    });
  }

  return mealScanResponseSchema.parse({
    scanId: String(value.id ?? value._id),
    photoS3Key: value.photoS3Key,
    analysis,
    coachContent:
      (value.coachContent as MealScanCoachContent | null | undefined) ?? null,
    note: value.note,
    visionEngineVersion: value.visionEngineVersion,
  });
}

async function findSuccessfulIdempotentScan(
  userId: string,
  idempotencyKey?: string,
): Promise<MealScanDocument | null> {
  if (!idempotencyKey) {
    return null;
  }

  const existing = await MealScanModel.findOne({ userId, idempotencyKey });
  return existing?.analysis ? existing : null;
}

export async function analyzeMealScan(userId: string, input: MealScanInput) {
  const existing = await findSuccessfulIdempotentScan(
    userId,
    input.idempotencyKey,
  );
  if (existing) {
    return serializeScan(existing);
  }

  const imageBytes = decodeAndValidateImage(
    input.imageData,
    input.imageMimeType,
  );
  const normalizedImage = input.imageData.trim();
  const photoS3Key = buildMealScanObjectKey(userId, input.imageMimeType);
  const capturedAt = input.capturedAt ? new Date(input.capturedAt) : new Date();

  try {
    await putS3Object({
      key: photoS3Key,
      body: imageBytes,
      contentType: input.imageMimeType,
    });
  } catch {
    throw storageFailed();
  }

  const analysis = await generateMealScanVision(
    normalizedImage,
    input.imageMimeType,
  );
  const { snapshot, biggestWorry } = await computeProteinSnapshot({
    userId,
    capturedAt,
    analysis,
  });
  const coachContent = buildCoachContent(analysis);
  const note = await resolveTrackerNote({ analysis, snapshot, biggestWorry });

  try {
    const scan = await MealScanModel.create({
      userId,
      photoS3Key,
      imageMimeType: input.imageMimeType,
      analysis,
      coachContent,
      note,
      idempotencyKey: input.idempotencyKey,
      visionEngineVersion: MEAL_SCAN_VISION_ENGINE_VERSION,
      coachContentVersion: coachContent.copyVersion,
    });

    return serializeScan(scan);
  } catch (error) {
    if (input.idempotencyKey && isDuplicateIdempotencyError(error)) {
      const idempotentScan = await findSuccessfulIdempotentScan(
        userId,
        input.idempotencyKey,
      );
      if (idempotentScan) {
        return serializeScan(idempotentScan);
      }
    }

    throw error;
  }
}

export async function parseVoiceMeal(userId: string, input: MealVoiceInput) {
  let analysis: MealScanAnalysis;
  let visionEngineVersion = MEAL_SCAN_TEXT_ENGINE_VERSION;

  try {
    analysis = await generateMealTextAnalysis(input.transcript);
  } catch (error) {
    logger.warn({ error }, "[meal-scan] voice parse failed");
    const words = input.transcript.trim().split(/\s+/).length;
    const estimatedCalories = clamp(words * 12, 0, 1200);
    analysis = {
      foodName: input.transcript.slice(0, 80),
      servingSize: "voice estimate",
      protein: 0,
      calories: estimatedCalories,
      carbs: 0,
      fat: 0,
      fiber: 0,
      confidence: 0.25,
    };
    visionEngineVersion = "voice-log-fallback-v1";
  }

  const capturedAt = input.recordedAt ? new Date(input.recordedAt) : new Date();
  const { snapshot, biggestWorry } = await computeProteinSnapshot({
    userId,
    capturedAt,
    analysis,
  });
  const note =
    visionEngineVersion === MEAL_SCAN_TEXT_ENGINE_VERSION
      ? await resolveTrackerNote({ analysis, snapshot, biggestWorry })
      : fallbackNote(analysis, snapshot);

  return mealScanResponseSchema.parse({
    scanId: `voice-${Date.now()}`,
    analysis,
    coachContent: buildCoachContent(analysis),
    note,
    visionEngineVersion,
  });
}

export async function getMealLogScanDetail(userId: string, mealLogId: string) {
  if (!isValidObjectId(mealLogId)) {
    throw new NotFoundError("Meal log not found");
  }

  const log = await MealLogModel.findOne({
    _id: mealLogId,
    userId,
    deletedAt: null,
  });
  if (!log) {
    throw new NotFoundError("Meal log not found");
  }

  if (!log.photoS3Key) {
    return mealLogScanDetailResponseSchema.parse({
      photoViewUrl: null,
      analysis: null,
      coachContent: null,
      note: null,
    });
  }

  const [photoViewUrl, scan] = await Promise.all([
    createPresignedGetUrl({ key: log.photoS3Key }),
    MealScanModel.findOne({ userId, photoS3Key: log.photoS3Key }),
  ]);
  const scanValue = scan ? toPlainRecord(scan) : null;

  return mealLogScanDetailResponseSchema.parse({
    photoViewUrl,
    analysis: (scanValue?.analysis as MealScanAnalysis | null | undefined) ?? null,
    coachContent:
      (scanValue?.coachContent as MealScanCoachContent | null | undefined) ??
      null,
    note: (scanValue?.note as string | null | undefined) ?? null,
  });
}
