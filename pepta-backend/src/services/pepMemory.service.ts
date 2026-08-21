import OpenAI from "openai";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { PepMemoryModel, type PepPushCopySource } from "../models";
import {
  loadPepPushContext,
  selectPepPushCandidate,
  type PepPushCandidate,
  type PepPushContext,
  type PepPushNotification,
} from "./pepPushCopy.service";
import { buildPepSideEffectTip } from "./pepSideEffectTips.service";

export const PEP_MEMORY_VERSION = "pep-memory-v1";
export const PEP_MEMORY_SUMMARY_VERSION = "pep-memory-summary-v1";

export interface PepMemoryLastNotification {
  priorityId: string;
  windowKey: string;
  sentAt: Date;
  source: PepPushCopySource;
}

export interface PepMemorySnapshot {
  contextVersion: string;
  sourceUpdatedAt: Date;
  refreshedAt: Date;
  nextDoseWindow: {
    compoundName: string;
    nextDoseAt: Date;
    hoursUntilNextDose: number;
  } | null;
  nutritionGaps: {
    proteinGramsRemaining: number | null;
    waterOzRemaining: number | null;
    fiberGramsRemaining: number | null;
  };
  recentSideEffects: Array<{
    types: string[];
    severity: number;
    when: Date;
    label: string;
    supportTip: string;
    clinicianPrompt: boolean;
  }>;
  lastMealPattern: {
    foodName: string;
    protein: number;
    calories: number;
    when: Date;
  } | null;
  latestWeightTrend: {
    latestValue: number;
    unit: string;
    when: Date;
  } | null;
  currentPriority: {
    priorityId: string;
    importance: "high" | "normal";
    pushEligible: boolean;
    windowKey: string;
    reason: string;
    title: string;
    body: string;
  } | null;
  lastNotification: PepMemoryLastNotification | null;
  aiSummary: {
    text: string;
    generatedAt: Date;
    copyVersion: string;
  } | null;
}

export type GeneratePepMemorySummary = (input: {
  system: string;
  payload: string;
  context: PepPushContext;
  candidate: PepPushCandidate | null;
}) => Promise<string | null>;

export interface RefreshPepMemoryOptions {
  aiPushCopyConsent?: boolean;
  loadContext?: (userId: string, now: Date) => Promise<PepPushContext>;
  generateSummary?: GeneratePepMemorySummary;
  candidate?: PepPushCandidate | null;
  notification?: Pick<PepPushNotification, "title" | "body"> | null;
  lastNotification?: PepMemoryLastNotification | null;
}

type RefreshableLogService<TCreate, TCreateResponse, TDeleteResponse> = {
  create(userId: string, body: TCreate): Promise<TCreateResponse>;
  softDelete(userId: string, id: string): Promise<TDeleteResponse>;
};

let openAIClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!env.openai.apiKey) return null;
  openAIClient ??= new OpenAI({ apiKey: env.openai.apiKey, timeout: 6000 });
  return openAIClient;
}

function positiveGap(
  target: number | null,
  actual: number,
): number | null {
  if (typeof target !== "number" || target <= 0) return null;
  return Math.max(0, Math.round(target - actual));
}

function safeDate(value: string): Date {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function documentObject(document: unknown): Record<string, unknown> {
  if (document && typeof document === "object") {
    const maybeDocument = document as { toObject?: unknown };
    if (typeof maybeDocument.toObject === "function") {
      const value = maybeDocument.toObject();
      return value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    }
    return document as Record<string, unknown>;
  }
  return {};
}

export const PEP_MEMORY_SUMMARY_SYSTEM_PROMPT = [
  // ROUTE-NEUTRAL PERSONA (2026-08-11). Pep used to introduce itself as "the
  // friendly syringe mascot", which primed every answer toward injections —
  // including answers to users whose medication is a daily pill. Pep is a
  // guide to the user's tracking, not to one delivery method.
  "You are Pep, the friendly guide in Pepta, a GLP-1 tracking app.",
  "Summarize the user's recent tracking context for future Pep messages.",
  "Use only provided data. Never recommend dose changes, medication changes, side-effect treatment, or drug safety advice.",
  "If side effects are severe or worsening, note that Pep should suggest contacting a clinician.",
  "Return one compact paragraph under 90 words.",
].join(" ");

async function defaultGenerateSummary({
  system,
  payload,
}: {
  system: string;
  payload: string;
}): Promise<string | null> {
  const client = getOpenAIClient();
  if (!client) return null;
  const response = await client.responses.create({
    model: "gpt-4o-mini",
    instructions: system,
    input: payload,
    max_output_tokens: 180,
    store: false,
  });
  return response.output_text ?? null;
}

export function buildPepMemorySnapshot(input: {
  context: PepPushContext;
  candidate: PepPushCandidate | null;
  notification?: Pick<PepPushNotification, "title" | "body"> | null;
  lastNotification?: PepMemoryLastNotification | null;
  aiSummary:
    | {
        text: string;
        generatedAt: Date;
        copyVersion: string;
      }
    | null;
  now: Date;
}): PepMemorySnapshot {
  const { context, candidate, notification, now } = input;
  const latestMeal = context.recentMeals[0] ?? null;
  const latestWeight = context.latestWeight;

  return {
    contextVersion: PEP_MEMORY_VERSION,
    sourceUpdatedAt: now,
    refreshedAt: now,
    nextDoseWindow: context.nextDose
      ? {
          compoundName: context.nextDose.compoundName,
          nextDoseAt: safeDate(context.nextDose.nextDoseAt),
          hoursUntilNextDose: context.nextDose.hoursUntilNextDose,
        }
      : null,
    nutritionGaps: {
      proteinGramsRemaining: positiveGap(
        context.nutrition.proteinTargetGrams,
        context.nutrition.proteinGrams,
      ),
      waterOzRemaining: positiveGap(
        context.nutrition.waterTargetOz,
        context.nutrition.waterOz,
      ),
      fiberGramsRemaining: positiveGap(
        context.nutrition.fiberTargetGrams,
        context.nutrition.fiberGrams,
      ),
    },
    recentSideEffects: context.recentSideEffects.map((effect) => {
      const tip = buildPepSideEffectTip(effect);
      return {
        types: effect.types,
        severity: effect.severity,
        when: safeDate(effect.when),
        label: tip.label,
        supportTip: tip.supportTip,
        clinicianPrompt: tip.clinicianPrompt,
      };
    }),
    lastMealPattern: latestMeal
      ? {
          foodName: latestMeal.foodName,
          protein: latestMeal.protein,
          calories: latestMeal.calories,
          when: safeDate(latestMeal.when),
        }
      : null,
    latestWeightTrend: latestWeight
      ? {
          latestValue: latestWeight.value,
          unit: latestWeight.unit,
          when: safeDate(latestWeight.when),
        }
      : null,
    currentPriority: candidate
      ? {
          priorityId: candidate.priorityId,
          importance: candidate.importance,
          pushEligible: candidate.pushEligible,
          windowKey: candidate.windowKey,
          reason: candidate.reason,
          title: notification?.title ?? candidate.fallback.title,
          body: notification?.body ?? candidate.fallback.body,
        }
      : null,
    lastNotification: input.lastNotification ?? null,
    aiSummary: input.aiSummary,
  };
}

/**
 * How long a stored AI summary is considered current.
 *
 * The scheduler sweeps every 15 minutes, so without this the summary was
 * regenerated ~96 times a day per consenting user — a paid model call each
 * time — to restate a rolling narrative that barely moves between sweeps, and
 * almost none of which ever became a notification anyone saw.
 */
const AI_SUMMARY_MAX_AGE_MS = 6 * 60 * 60 * 1000;

async function maybeGenerateAISummary(input: {
  userId: string;
  context: PepPushContext;
  candidate: PepPushCandidate | null;
  aiPushCopyConsent: boolean;
  now: Date;
  generateSummary?: GeneratePepMemorySummary;
}): Promise<PepMemorySnapshot["aiSummary"]> {
  if (!input.aiPushCopyConsent) return null;

  // Reuse a summary that is still current rather than paying to rewrite it.
  // Returning the stored one (rather than null) matters: the upsert only
  // preserves what it is given or leaves the field untouched, and this keeps
  // the snapshot honest about what Pep actually knows.
  const existing = await PepMemoryModel.findOne({ userId: input.userId })
    .select({ aiSummary: 1 })
    .lean();
  const stored = (existing as { aiSummary?: PepMemorySnapshot["aiSummary"] } | null)
    ?.aiSummary;
  if (
    stored?.text &&
    stored.copyVersion === PEP_MEMORY_SUMMARY_VERSION &&
    stored.generatedAt &&
    input.now.getTime() - new Date(stored.generatedAt).getTime() < AI_SUMMARY_MAX_AGE_MS
  ) {
    return stored;
  }

  const generateSummary = input.generateSummary ?? defaultGenerateSummary;

  try {
    const text = await generateSummary({
      system: PEP_MEMORY_SUMMARY_SYSTEM_PROMPT,
      payload: JSON.stringify({
        context: input.context,
        currentPriority: input.candidate,
      }),
      context: input.context,
      candidate: input.candidate,
    });
    const cleaned = text?.trim();
    if (!cleaned) return null;
    return {
      text: cleaned.slice(0, 1200),
      generatedAt: input.now,
      copyVersion: PEP_MEMORY_SUMMARY_VERSION,
    };
  } catch (error) {
    logger.warn({ error }, "[pep-memory] AI summary generation failed");
    return null;
  }
}

async function upsertPepMemory(
  userId: string,
  snapshot: PepMemorySnapshot,
): Promise<void> {
  // A refresh that did not GENERATE a summary must not DELETE the one already
  // stored. Only the push scheduler passes consent, so every other refresh —
  // and one runs after every single log create and delete — arrives with
  // aiSummary null. Writing that null over the stored summary meant the
  // consented, paid-for summary survived only until the user logged a glass
  // of water, and Pep chat almost never saw one.
  //
  // Absence of a summary is "nothing new to say", not "forget what you knew".
  // Clearing it is a separate, explicit act — see clearPepMemoryAiSummary.
  const { aiSummary, ...rest } = snapshot;
  await PepMemoryModel.findOneAndUpdate(
    { userId },
    {
      $set: aiSummary ? { ...rest, aiSummary } : rest,
      $setOnInsert: { userId, ...(aiSummary ? {} : { aiSummary: null }) },
    },
    { new: true, upsert: true, runValidators: true },
  );
}

/**
 * Drops the stored AI summary. Consent withdrawal is the reason this exists:
 * once a user turns AI copy off, the text generated under it must go, and the
 * refresh path deliberately no longer clears it as a side effect.
 */
export async function clearPepMemoryAiSummary(userId: string): Promise<void> {
  await PepMemoryModel.updateOne({ userId }, { $set: { aiSummary: null } });
}

export async function refreshPepMemoryFromContext(
  userId: string,
  context: PepPushContext,
  now = new Date(),
  options: Omit<RefreshPepMemoryOptions, "loadContext"> = {},
): Promise<PepMemorySnapshot> {
  const candidate =
    options.candidate === undefined
      ? selectPepPushCandidate(context, now)
      : options.candidate;
  const aiSummary = await maybeGenerateAISummary({
    userId,
    context,
    candidate,
    aiPushCopyConsent: options.aiPushCopyConsent === true,
    now,
    generateSummary: options.generateSummary,
  });
  const snapshot = buildPepMemorySnapshot({
    context,
    candidate,
    notification: options.notification,
    lastNotification: options.lastNotification,
    aiSummary,
    now,
  });
  await upsertPepMemory(userId, snapshot);
  return snapshot;
}

export async function refreshPepMemory(
  userId: string,
  now = new Date(),
  options: RefreshPepMemoryOptions = {},
): Promise<PepMemorySnapshot> {
  const loadContext = options.loadContext ?? loadPepPushContext;
  const context = await loadContext(userId, now);
  return refreshPepMemoryFromContext(userId, context, now, options);
}

export async function recordPepMemoryNotification(
  input: PepMemoryLastNotification & { userId: string },
): Promise<void> {
  await PepMemoryModel.findOneAndUpdate(
    { userId: input.userId },
    {
      $set: {
        contextVersion: PEP_MEMORY_VERSION,
        refreshedAt: input.sentAt,
        lastNotification: {
          priorityId: input.priorityId,
          windowKey: input.windowKey,
          sentAt: input.sentAt,
          source: input.source,
        },
      },
      $setOnInsert: {
        userId: input.userId,
        sourceUpdatedAt: input.sentAt,
        nutritionGaps: {},
        recentSideEffects: [],
      },
    },
    { new: true, upsert: true, runValidators: true },
  );
}

export async function getPepMemoryForChat(
  userId: string,
): Promise<Record<string, unknown> | null> {
  const document = await PepMemoryModel.findOne({ userId });
  const memory = documentObject(document);
  if (Object.keys(memory).length === 0) return null;

  return {
    nextDoseWindow: memory.nextDoseWindow ?? null,
    nutritionGaps: memory.nutritionGaps ?? null,
    recentSideEffects: memory.recentSideEffects ?? [],
    lastMealPattern: memory.lastMealPattern ?? null,
    latestWeightTrend: memory.latestWeightTrend ?? null,
    currentPriority: memory.currentPriority ?? null,
    lastNotification: memory.lastNotification ?? null,
    aiSummary: memory.aiSummary ?? null,
  };
}

export function withPepMemoryRefreshAfterLogCreate<
  TCreate,
  TCreateResponse,
  TDeleteResponse,
  TService extends object,
>(
  service: TService &
    RefreshableLogService<TCreate, TCreateResponse, TDeleteResponse>,
  refresh: (userId: string) => Promise<unknown> = (userId) =>
    refreshPepMemory(userId),
): TService & RefreshableLogService<TCreate, TCreateResponse, TDeleteResponse> {
  return {
    ...service,
    async create(userId: string, body: TCreate): Promise<TCreateResponse> {
      const response = await service.create(userId, body);
      try {
        await refresh(userId);
      } catch (error) {
        logger.warn({ error, userId }, "[pep-memory] refresh after log failed");
      }
      return response;
    },
    async softDelete(userId: string, id: string): Promise<TDeleteResponse> {
      const response = await service.softDelete(userId, id);
      try {
        await refresh(userId);
      } catch (error) {
        logger.warn({ error, userId }, "[pep-memory] refresh after delete failed");
      }
      return response;
    },
  };
}
