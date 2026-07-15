import OpenAI from "openai";
import type { HomeResponse, TrackResponse } from "@pepta/shared";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { getHome } from "./home.service";
import { buildPepSideEffectTip } from "./pepSideEffectTips.service";
import { getTrack } from "./track.service";

export type PepPushPriorityId =
  | "dose_due"
  | "post_dose_checkin"
  | "side_effect_clinician"
  | "side_effect_support"
  | "protein_anchor"
  | "hydration_check"
  | "trend_review";

export type PepPushImportance = "high" | "normal";
export type PepPushCopySource = "ai" | "deterministic";

export interface PepPushCopy {
  title: string;
  body: string;
}

export interface PepPushCandidate {
  priorityId: PepPushPriorityId;
  importance: PepPushImportance;
  pushEligible: boolean;
  windowKey: string;
  fallback: PepPushCopy;
  reason: string;
}

export interface PepPushContext {
  timezone: string;
  streakDays: number;
  nextDose: {
    compoundName: string;
    nextDoseAt: string;
    hoursUntilNextDose: number;
  } | null;
  nutrition: {
    proteinGrams: number;
    proteinTargetGrams: number | null;
    waterOz: number;
    waterTargetOz: number | null;
    fiberGrams: number;
    fiberTargetGrams: number | null;
    calories: number;
  };
  latestWeight: {
    value: number;
    unit: string;
    when: string;
  } | null;
  goal: {
    weight: number | null;
    weightUnit: string | null;
    goalType: string | null;
    goalPace: string | null;
    biggestWorry: string | null;
  };
  recentDoses: Array<{
    amount: number;
    unit: string;
    when: string;
  }>;
  recentMeals: Array<{
    foodName: string;
    protein: number;
    calories: number;
    when: string;
  }>;
  recentSideEffects: Array<{
    types: string[];
    severity: number;
    when: string;
  }>;
}

export interface PepPushNotification extends PepPushCopy {
  source: PepPushCopySource;
  candidate: PepPushCandidate;
}

export interface GeneratePepPushCopyInput {
  system: string;
  payload: string;
}

export type GeneratePepPushCopy = (
  input: GeneratePepPushCopyInput,
) => Promise<string | null>;

export const PEP_PUSH_SYSTEM_PROMPT = [
  "You are Pep, the friendly syringe mascot of Pepta, a GLP-1 tracking app.",
  "Write one short push notification in Pep's voice from ONLY the provided candidate and user context.",
  "Use logged data when useful, but never invent numbers or imply clinical judgment.",
  "Never recommend dose changes, medication changes, side-effect treatment, or drug safety advice.",
  "If the candidate would require medical advice, return the deterministic-safe wording instead of clinical guidance.",
  'Return STRICT JSON only: {"title": string, "body": string}. Title must start with "Pep:". Body must be under 150 characters.',
].join(" ");

let openAIClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!env.openai.apiKey) return null;
  openAIClient ??= new OpenAI({ apiKey: env.openai.apiKey, timeout: 6000 });
  return openAIClient;
}

async function defaultGenerateCopy({
  system,
  payload,
}: GeneratePepPushCopyInput): Promise<string | null> {
  const client = getOpenAIClient();
  if (!client) return null;
  const response = await client.responses.create({
    model: "gpt-4o-mini",
    instructions: system,
    input: payload,
    max_output_tokens: 160,
    store: false,
  });
  return response.output_text ?? null;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function windowDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return dateOnly(new Date());
  return dateOnly(date);
}

function asDateMs(value: string | Date | undefined): number {
  if (!value) return Number.NaN;
  const date = value instanceof Date ? value : new Date(value);
  return date.getTime();
}

function isToday(iso: string, now: Date): boolean {
  return windowDate(iso) === dateOnly(now);
}

function hoursBetween(later: Date, earlier: string | Date): number {
  return (later.getTime() - asDateMs(earlier)) / 36e5;
}

function recentFirst<T extends { datetime: string }>(rows: T[], limit: number): T[] {
  return [...rows]
    .sort((a, b) => asDateMs(b.datetime) - asDateMs(a.datetime))
    .slice(0, limit);
}

function repeatedSideEffect(
  effects: PepPushContext["recentSideEffects"],
  latest: PepPushContext["recentSideEffects"][number],
): boolean {
  const latestTypes = new Set(latest.types);
  if (latestTypes.size === 0) return false;
  return (
    effects.filter((effect) =>
      effect.types.some((type) => latestTypes.has(type)),
    ).length >= 2
  );
}

function selectSideEffectCandidate(
  context: PepPushContext,
  now: Date,
  mode: "clinician" | "support",
): PepPushCandidate | null {
  const latest = context.recentSideEffects[0];
  if (!latest) return null;
  const hoursSince = hoursBetween(now, latest.when);
  if (Number.isNaN(hoursSince) || hoursSince < 0 || hoursSince > 72) {
    return null;
  }

  const tip = buildPepSideEffectTip(latest);
  const priorityId = tip.clinicianPrompt
    ? "side_effect_clinician"
    : "side_effect_support";
  if (
    (mode === "clinician" && priorityId !== "side_effect_clinician") ||
    (mode === "support" && priorityId !== "side_effect_support")
  ) {
    return null;
  }

  const repeated = repeatedSideEffect(context.recentSideEffects, latest);
  const importantSupport = latest.severity >= 3 || repeated;
  return {
    priorityId,
    importance: tip.clinicianPrompt || importantSupport ? "high" : "normal",
    pushEligible: tip.clinicianPrompt || importantSupport,
    windowKey: `${priorityId}:${windowDate(latest.when)}`,
    fallback: {
      title: tip.clinicianPrompt
        ? "Pep: symptom safety check"
        : "Pep: symptom check",
      body: tip.supportTip,
    },
    reason: tip.clinicianPrompt
      ? "The user recently logged a high-severity side effect."
      : "The user recently logged a side effect that Pep can help track.",
  };
}

export function buildPepPushContextFromResponses(
  home: HomeResponse,
  track: TrackResponse,
  _now = new Date(),
): PepPushContext {
  const profile = home.profile;
  const targetProtein =
    typeof profile?.dailyProteinTargetGrams === "number"
      ? profile.dailyProteinTargetGrams
      : null;
  const waterTarget =
    typeof profile?.dailyWaterTargetOz === "number"
      ? profile.dailyWaterTargetOz
      : null;
  const fiberTarget =
    typeof profile?.dailyFiberTargetGrams === "number"
      ? profile.dailyFiberTargetGrams
      : null;

  return {
    timezone: profile?.timezone ?? env.scheduler.timezone,
    streakDays: home.streakDays,
    nextDose: home.nextDose
      ? {
          compoundName: home.nextDose.compoundName,
          nextDoseAt: home.nextDose.nextDoseAt,
          hoursUntilNextDose: home.nextDose.hoursUntilNextDose,
        }
      : null,
    nutrition: {
      proteinGrams: home.todayProteinGrams,
      proteinTargetGrams: targetProtein,
      waterOz: home.todayWaterOz,
      waterTargetOz: waterTarget,
      fiberGrams: home.todayFiberGrams,
      fiberTargetGrams: fiberTarget,
      calories: home.todayCalories,
    },
    latestWeight: home.latestWeight
      ? {
          value: home.latestWeight.value,
          unit: home.latestWeight.unit,
          when: home.latestWeight.datetime,
        }
      : null,
    goal: {
      weight: profile?.goalWeight ?? null,
      weightUnit: profile?.goalWeightUnit ?? null,
      goalType: profile?.goalType ?? null,
      goalPace: profile?.goalPace ?? null,
      biggestWorry: profile?.biggestWorry ?? null,
    },
    recentDoses: recentFirst(track.doseLogs, 3).map((dose) => ({
      amount: dose.amount,
      unit: dose.unit,
      when: dose.datetime,
    })),
    recentMeals: recentFirst(track.mealLogs, 4).map((meal) => ({
      foodName: meal.foodName,
      protein: meal.protein,
      calories: meal.calories,
      when: meal.datetime,
    })),
    recentSideEffects: recentFirst(track.sideEffectLogs, 3).map((effect) => ({
      types: effect.types,
      severity: effect.severity,
      when: effect.datetime,
    })),
  };
}

export async function loadPepPushContext(
  userId: string,
  now = new Date(),
): Promise<PepPushContext> {
  const [home, track] = await Promise.all([
    getHome(userId, now, "today", { allowAIInsightProse: false }),
    getTrack(userId, { limit: 25 }),
  ]);
  return buildPepPushContextFromResponses(home, track, now);
}

export function selectPepPushCandidate(
  context: PepPushContext,
  now = new Date(),
): PepPushCandidate | null {
  const clinicianSideEffect = selectSideEffectCandidate(
    context,
    now,
    "clinician",
  );
  if (clinicianSideEffect) {
    return clinicianSideEffect;
  }

  if (
    context.nextDose &&
    context.nextDose.hoursUntilNextDose >= 0 &&
    context.nextDose.hoursUntilNextDose <= 4
  ) {
    return {
      priorityId: "dose_due",
      importance: "high",
      pushEligible: true,
      windowKey: `dose_due:${windowDate(context.nextDose.nextDoseAt)}`,
      fallback: {
        title: "Pep: shot time",
        body: `I have ${context.nextDose.compoundName} on the board. Log it when it's done and I'll keep the cycle lined up.`,
      },
      reason: "The user's next scheduled dose is within four hours.",
    };
  }

  const lastDose = context.recentDoses[0];
  if (lastDose) {
    const hoursSinceLastDose = (now.getTime() - asDateMs(lastDose.when)) / 36e5;
    if (hoursSinceLastDose >= 18 && hoursSinceLastDose <= 30) {
      return {
        priorityId: "post_dose_checkin",
        importance: "high",
        pushEligible: true,
        windowKey: `post_dose_checkin:${windowDate(lastDose.when)}`,
        fallback: {
          title: "Pep: post-shot check-in",
          body: "Quick check for me: appetite, side effects, water, and protein while this dose settles in.",
        },
        reason: "The user is in the day-after-dose check-in window.",
      };
    }
  }

  const supportSideEffect = selectSideEffectCandidate(context, now, "support");
  if (supportSideEffect?.importance === "high") {
    return supportSideEffect;
  }

  const proteinTarget = context.nutrition.proteinTargetGrams ?? 0;
  const proteinGap = proteinTarget - context.nutrition.proteinGrams;
  if (proteinTarget > 0 && proteinGap >= 55) {
    return {
      priorityId: "protein_anchor",
      importance: "high",
      pushEligible: true,
      windowKey: `protein_anchor:${dateOnly(now)}`,
      fallback: {
        title: "Pep: protein checkpoint",
        body: `You're ${Math.round(proteinGap)}g from today's protein target. Put protein first on the next meal.`,
      },
      reason: "The user has a large protein gap today.",
    };
  }

  if (supportSideEffect) {
    return supportSideEffect;
  }

  const waterTarget = context.nutrition.waterTargetOz ?? 0;
  if (waterTarget > 0 && context.nutrition.waterOz < waterTarget * 0.35) {
    return {
      priorityId: "hydration_check",
      importance: "normal",
      pushEligible: false,
      windowKey: `hydration_check:${dateOnly(now)}`,
      fallback: {
        title: "Pep: water + fiber check",
        body: "Water and fiber check. Small, boring, useful. My favorite category.",
      },
      reason: "The user is behind the hydration target.",
    };
  }

  if (!lastDose && !context.recentMeals.some((meal) => isToday(meal.when, now))) {
    return {
      priorityId: "trend_review",
      importance: "normal",
      pushEligible: false,
      windowKey: `trend_review:${dateOnly(now)}`,
      fallback: {
        title: "Pep: quick setup",
        body: "A dose, meal, water, or weight log gives me enough signal to stay useful with you.",
      },
      reason: "The user has little recent data.",
    };
  }

  return null;
}

function parseAIJson(raw: string | null): PepPushCopy | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    const value: unknown = JSON.parse(cleaned);
    if (
      value &&
      typeof value === "object" &&
      typeof (value as { title?: unknown }).title === "string" &&
      typeof (value as { body?: unknown }).body === "string"
    ) {
      let title = (value as { title: string }).title.trim().slice(0, 60);
      const body = (value as { body: string }).body.trim().slice(0, 180);
      if (!title.toLowerCase().startsWith("pep:")) {
        title = `Pep: ${title.replace(/^pep\s*:?\s*/i, "")}`;
      }
      if (title.length > 0 && body.length > 0) {
        return { title, body };
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function createPepPushNotification(input: {
  context: PepPushContext;
  candidate: PepPushCandidate;
  aiPushCopyConsent: boolean;
  generateCopy?: GeneratePepPushCopy;
}): Promise<PepPushNotification> {
  const fallback: PepPushNotification = {
    ...input.candidate.fallback,
    source: "deterministic",
    candidate: input.candidate,
  };

  if (!input.aiPushCopyConsent) {
    return fallback;
  }

  const generateCopy = input.generateCopy ?? defaultGenerateCopy;
  try {
    const raw = await generateCopy({
      system: PEP_PUSH_SYSTEM_PROMPT,
      payload: JSON.stringify({
        candidate: {
          priorityId: input.candidate.priorityId,
          reason: input.candidate.reason,
          fallback: input.candidate.fallback,
        },
        context: input.context,
      }),
    });
    const parsed = parseAIJson(raw);
    if (!parsed) return fallback;
    return {
      ...parsed,
      source: "ai",
      candidate: input.candidate,
    };
  } catch (error) {
    logger.warn({ error }, "[pep-push] AI push copy generation failed");
    return fallback;
  }
}
