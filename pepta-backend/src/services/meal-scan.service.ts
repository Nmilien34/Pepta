import {
  mealLogScanDetailResponseSchema,
  type MealBarcodeInput,
  type MealProductScanInput,
  type MealProductScanMetadata,
  mealScanResponseSchema,
  type MealScanAnalysis,
  type MealScanCoachContent,
  type MealScanInput,
  type MealVoiceInput,
} from "@pepta/shared";
import { isValidObjectId } from "mongoose";
import { startOfUtcWeek } from "../lib/dates";
import { parseHomeTimezone, resolveHomeWindow } from "../lib/homeRange";
import { addDaysDateOnly, dateOnlyInTz, dayOfWeekOf, zonedTimeToUtc } from "../lib/timezone";
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
  discardMedia,
  getMediaViewUrl,
  persistMealScanMedia,
} from "./media.service";
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
import {
  resolveProductNutrition,
  type ProductNutritionResult,
} from "./product-nutrition.service";
import {
  generateProductCluesFromImage,
  PRODUCT_SCAN_VISION_ENGINE_VERSION,
} from "./product-scan-vision.service";

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

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Monday 00:00 of the local week containing `at`. */
function startOfLocalWeek(at: Date, timeZone: string): Date {
  const today = dateOnlyInTz(at, timeZone);
  const weekday = dayOfWeekOf(today); // 0 = Sunday
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  return zonedTimeToUtc(addDaysDateOnly(today, -daysSinceMonday), "00:00", timeZone);
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

  // THE USER'S DAY, NOT THE SERVER'S. These windows decide the "you'd be at
  // Xg of Yg protein today" figure that the AI note then states as fact. On
  // UTC boundaries a user in Los Angeles scanning dinner at 6pm was already
  // into the next UTC day, so the snapshot counted only what they had logged
  // since 5pm local and the note contradicted their own Home screen.
  const timeZone = parseHomeTimezone(profile.timezone);
  const { start: todayStart, end: tomorrowStart } = resolveHomeWindow(
    "today",
    input.capturedAt,
    timeZone,
  );
  // Week-to-date, Monday-anchored, in the same zone.
  const weekStart = timeZone
    ? startOfLocalWeek(input.capturedAt, timeZone)
    : startOfUtcWeek(input.capturedAt);
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
    ...(value.photoMediaId
      ? { photoMediaId: String(value.photoMediaId) }
      : {}),
    analysis,
    coachContent:
      (value.coachContent as MealScanCoachContent | null | undefined) ?? null,
    note: value.note,
    visionEngineVersion: value.visionEngineVersion,
    product:
      (value.product as MealProductScanMetadata | null | undefined) ??
      undefined,
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
  const capturedAt = input.capturedAt ? new Date(input.capturedAt) : new Date();

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
  let media: Awaited<ReturnType<typeof persistMealScanMedia>>;
  try {
    media = await persistMealScanMedia(userId, {
      bytes: imageBytes,
      contentType: input.imageMimeType,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw storageFailed();
  }

  try {
    const scan = await MealScanModel.create({
      userId,
      photoMediaId: media.mediaId,
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
    await discardMedia(userId, media.mediaId).catch((discardError) => {
      logger.warn(
        { error: discardError, mediaId: media.mediaId },
        "[meal-scan] failed to queue uncommitted media",
      );
    });
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
  const visionEngineVersion = MEAL_SCAN_TEXT_ENGINE_VERSION;

  // NO FABRICATED FALLBACK. This used to catch any model failure and invent
  // an analysis: protein/carbs/fat/fiber all zero, calories derived from the
  // TRANSCRIPT'S WORD COUNT (words * 12). The user saw an ordinary review
  // card — "grilled chicken breast with rice and broccoli, 0 g protein,
  // 84 cal" with a confidence badge — and logging it wrote those numbers
  // into their day as a real meal. In a protein-tracking app for GLP-1
  // users, silently recording 0 g of protein for a chicken dinner is worse
  // than any error message.
  //
  // The failure now propagates. generateMealTextAnalysis raises an
  // actionable 503, and the app already handles it: "Couldn't read that
  // description. Try again, or log it manually."
  const analysis = await generateMealTextAnalysis(input.transcript);

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

function productMetadata(
  mode: MealProductScanMetadata["mode"],
  nutrition: ProductNutritionResult,
): MealProductScanMetadata {
  return {
    mode,
    ...(nutrition.barcode ? { barcode: nutrition.barcode } : {}),
    ...(nutrition.brand ? { brand: nutrition.brand } : {}),
    ...(nutrition.productName ? { productName: nutrition.productName } : {}),
    source: nutrition.source,
    citations: nutrition.citations,
  };
}

export async function analyzeProductScan(
  userId: string,
  input: MealProductScanInput,
) {
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
  const capturedAt = input.capturedAt ? new Date(input.capturedAt) : new Date();

  const clues = await generateProductCluesFromImage(
    normalizedImage,
    input.imageMimeType,
  );
  const nutrition = await resolveProductNutrition(clues);
  const analysis = nutrition.analysis;
  const { snapshot, biggestWorry } = await computeProteinSnapshot({
    userId,
    capturedAt,
    analysis,
  });
  const coachContent = buildCoachContent(analysis);
  const note = await resolveTrackerNote({ analysis, snapshot, biggestWorry });
  const product = productMetadata("product_scan", nutrition);
  let media: Awaited<ReturnType<typeof persistMealScanMedia>>;
  try {
    media = await persistMealScanMedia(userId, {
      bytes: imageBytes,
      contentType: input.imageMimeType,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw storageFailed();
  }

  try {
    const scan = await MealScanModel.create({
      userId,
      photoMediaId: media.mediaId,
      imageMimeType: input.imageMimeType,
      analysis,
      coachContent,
      product,
      note,
      idempotencyKey: input.idempotencyKey,
      visionEngineVersion: PRODUCT_SCAN_VISION_ENGINE_VERSION,
      coachContentVersion: coachContent.copyVersion,
    });

    return serializeScan(scan);
  } catch (error) {
    await discardMedia(userId, media.mediaId).catch((discardError) => {
      logger.warn(
        { error: discardError, mediaId: media.mediaId },
        "[meal-scan] failed to queue uncommitted media",
      );
    });
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

export async function lookupBarcodeMeal(
  userId: string,
  input: MealBarcodeInput,
) {
  const nutrition = await resolveProductNutrition({
    barcodeText: input.barcode,
    confidence: 1,
  });
  const analysis = nutrition.analysis;
  const capturedAt = input.scannedAt ? new Date(input.scannedAt) : new Date();
  const { snapshot, biggestWorry } = await computeProteinSnapshot({
    userId,
    capturedAt,
    analysis,
  });

  return mealScanResponseSchema.parse({
    scanId: `barcode-${Date.now()}`,
    analysis,
    coachContent: buildCoachContent(analysis),
    note: await resolveTrackerNote({ analysis, snapshot, biggestWorry }),
    visionEngineVersion: "barcode-lookup-v1",
    product: productMetadata("barcode", nutrition),
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

  if (!log.photoMediaId) {
    return mealLogScanDetailResponseSchema.parse({
      photoViewUrl: null,
      analysis: null,
      coachContent: null,
      note: null,
    });
  }

  const photoMediaId = log.photoMediaId.toString();
  const [photoViewUrl, scan] = await Promise.all([
    getMediaViewUrl(userId, photoMediaId),
    MealScanModel.findOne({ userId, photoMediaId }),
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
