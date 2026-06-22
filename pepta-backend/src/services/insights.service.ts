import OpenAI from 'openai';
import { insightSchema } from '@pepta/shared';
import { env } from '../config/env';
import { addUtcDays, startOfUtcDay, startOfUtcWeek } from '../lib/dates';
import {
  detectDoseCycleTrough,
  detectMedicationLevelState,
  detectProteinTrend,
  detectSideEffectCycleCorrelation,
  detectStall,
  type DetectorSeverity,
} from '../lib/insight-detectors';
import { daysSinceDose, cycleDayFromShotDay } from '../lib/week';
import { logger } from '../lib/logger';
import {
  DoseLogModel,
  InsightModel,
  MealLogModel,
  ProteinLogModel,
  ScheduleModel,
  SideEffectLogModel,
  UserProfileModel,
  WeightLogModel,
} from '../models';
import { getMedicationLevels } from './medication-level.service';

export const INSIGHT_COPY_VERSION = 'insight-copy-v1';
const INSIGHT_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

type InsightType =
  | 'medication_level'
  | 'dose_cycle'
  | 'side_effect_pattern'
  | 'protein_retention'
  | 'stall';

interface InsightDraft {
  type: InsightType;
  fallbackHeadline: string;
  fallbackBody: string;
  severity: DetectorSeverity;
  deterministicSignal: Record<string, unknown>;
}

interface InsightCopy {
  headline: string;
  body: string;
}

interface InsightProseInput extends InsightDraft {
  copyVersion: typeof INSIGHT_COPY_VERSION;
}

interface InsightServiceOptions {
  generateProse?: (input: InsightProseInput) => Promise<InsightCopy | null>;
  cacheTtlMs?: number;
}

let openAIClient: OpenAI | null = null;

function serializeInsight(document: {
  _id: unknown;
  type: string;
  headline: string;
  body: string;
  severity: DetectorSeverity;
  cta?: string;
  deterministicSignal: Record<string, unknown>;
  generatedAt: Date;
  copyVersion?: string | null;
}) {
  return insightSchema.parse({
    id: String(document._id),
    type: document.type,
    headline: document.headline,
    body: document.body,
    severity: document.severity,
    cta: document.cta,
    deterministicSignal: document.deterministicSignal,
    generatedAt: document.generatedAt.toISOString(),
    copyVersion: document.copyVersion ?? undefined,
  });
}

function sortedValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortedValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortedValue(entry)]),
    );
  }

  return value;
}

function signalsMatch(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return JSON.stringify(sortedValue(left)) === JSON.stringify(sortedValue(right));
}

function copyFromFallback(draft: InsightDraft): InsightCopy {
  return {
    headline: draft.fallbackHeadline,
    body: draft.fallbackBody,
  };
}

function isInsightCopy(value: unknown): value is InsightCopy {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).headline === 'string' &&
    typeof (value as Record<string, unknown>).body === 'string'
  );
}

function parseInsightCopy(outputText: string): InsightCopy | null {
  try {
    const parsed = JSON.parse(outputText) as unknown;

    if (!isInsightCopy(parsed)) {
      return null;
    }

    return {
      headline: parsed.headline.trim(),
      body: parsed.body.trim(),
    };
  } catch {
    return null;
  }
}

function getOpenAIClient(): OpenAI | null {
  if (!env.openai.apiKey) {
    return null;
  }

  openAIClient ??= new OpenAI({
    apiKey: env.openai.apiKey,
    timeout: 5000,
  });

  return openAIClient;
}

async function generateOpenAIInsightProse(input: InsightProseInput): Promise<InsightCopy | null> {
  const client = getOpenAIClient();

  if (!client) {
    return null;
  }

  const response = await client.responses.create({
    model: 'gpt-4o-mini',
    instructions:
      'Write calm, warm, honest Pepta insight copy for anxious GLP-1 users. Return JSON only with string keys "headline" and "body". Use only the provided deterministic signal. Do not invent numbers, medical claims, diagnoses, or guarantees.',
    input: JSON.stringify({
      type: input.type,
      deterministicSignal: input.deterministicSignal,
      fallbackHeadline: input.fallbackHeadline,
      fallbackBody: input.fallbackBody,
    }),
    max_output_tokens: 220,
    store: false,
  });

  return parseInsightCopy(response.output_text);
}

async function resolveCopy(input: {
  draft: InsightDraft;
  generateProse: (draft: InsightProseInput) => Promise<InsightCopy | null>;
}): Promise<InsightCopy> {
  try {
    const generated = await input.generateProse({
      ...input.draft,
      copyVersion: INSIGHT_COPY_VERSION,
    });

    if (generated?.headline && generated.body) {
      return generated;
    }
  } catch (error) {
    logger.warn({ error, insightType: input.draft.type }, '[insights] prose generation failed');
  }

  return copyFromFallback(input.draft);
}

async function proteinTrendDraft(userId: string, now: Date): Promise<InsightDraft | null> {
  const profile = await UserProfileModel.findOne({ userId });

  if (!profile) {
    return null;
  }

  const thisWeekStart = startOfUtcWeek(now);
  const weeks = await Promise.all(
    [2, 1, 0].map(async (weeksAgo) => {
      const start = addUtcDays(thisWeekStart, -weeksAgo * 7);
      const end = addUtcDays(start, 7);
      const [meals, proteins] = await Promise.all([
        MealLogModel.find({ userId, datetime: { $gte: start, $lt: end } }),
        ProteinLogModel.find({ userId, datetime: { $gte: start, $lt: end } }),
      ]);
      const protein =
        meals.reduce((sum, meal) => sum + meal.protein, 0) +
        proteins.reduce((sum, log) => sum + log.grams, 0);

      return {
        adherence: protein / 7 / profile.dailyProteinTargetGrams,
      };
    }),
  );
  const signal = detectProteinTrend(weeks);

  if (!signal.active) {
    return null;
  }

  return {
    type: 'protein_retention',
    fallbackHeadline: 'Protein trend is slipping',
    fallbackBody:
      'Protein adherence is declining across recent weeks. A simpler daily protein anchor may help.',
    severity: signal.severity,
    deterministicSignal: { ...signal },
  };
}

async function doseCycleDrafts(
  userId: string,
  levels: Awaited<ReturnType<typeof getMedicationLevels>>,
  now: Date,
): Promise<InsightDraft[]> {
  const drafts: InsightDraft[] = [];

  for (const level of levels) {
    const [latestDose, schedule] = await Promise.all([
      DoseLogModel.findOne({ userId, compoundId: level.compoundId }).sort({ datetime: -1 }),
      ScheduleModel.findOne({ userId, compoundId: level.compoundId, active: true }),
    ]);

    if (!latestDose) {
      continue;
    }

    const intervalDays = schedule?.intervalDays ?? (schedule?.frequency === 'weekly' ? 7 : null);

    if (!intervalDays) {
      continue;
    }

    const signal = detectDoseCycleTrough({
      daysSinceLastDose: daysSinceDose(latestDose.datetime.toISOString(), now),
      scheduleIntervalDays: intervalDays,
    });

    if (signal.active) {
      drafts.push({
        type: 'dose_cycle',
        fallbackHeadline: `${level.compoundName} is late-cycle`,
        fallbackBody:
          'You may be near the lower-support part of this dose cycle. Keep meals steady and watch protein consistency.',
        severity: signal.severity,
        deterministicSignal: {
          ...signal,
          compoundId: level.compoundId,
        },
      });
    }
  }

  return drafts;
}

async function sideEffectDraft(userId: string, now: Date): Promise<InsightDraft | null> {
  const latestDose = await DoseLogModel.findOne({ userId }).sort({ datetime: -1 });

  if (!latestDose) {
    return null;
  }

  const sideEffects = await SideEffectLogModel.find({
    userId,
    datetime: { $gte: addUtcDays(startOfUtcDay(now), -45) },
  });
  const signal = detectSideEffectCycleCorrelation(
    sideEffects.map((log) => ({
      cycleDay: cycleDayFromShotDay(latestDose.datetime.toISOString(), log.datetime),
      severity: log.severity,
    })),
  );

  if (!signal.active) {
    return null;
  }

  return {
    type: 'side_effect_pattern',
    fallbackHeadline: 'Side effects have a timing pattern',
    fallbackBody:
      'Recent side-effect logs cluster around a repeatable dose-cycle day. Planning food, hydration, and rest around that window may help.',
    severity: signal.severity,
    deterministicSignal: { ...signal },
  };
}

async function stallDraft(userId: string, now: Date): Promise<InsightDraft | null> {
  const weights = await WeightLogModel.find({
    userId,
    datetime: { $gte: addUtcDays(startOfUtcDay(now), -30) },
  }).sort({ datetime: 1 });
  const signal = detectStall(
    weights.map((weight) => ({
      value: weight.value,
      datetime: weight.datetime.toISOString(),
    })),
  );

  if (!signal.active) {
    return null;
  }

  return {
    type: 'stall',
    fallbackHeadline: 'Weight has been flat',
    fallbackBody:
      'Your recent weights look effectively flat. A focused check on logging, protein, training, and dose timing can clarify the next lever.',
    severity: signal.severity,
    deterministicSignal: { ...signal },
  };
}

function dedupeDraftsByType(drafts: InsightDraft[]): InsightDraft[] {
  const byType = new Map<InsightType, InsightDraft>();

  for (const draft of drafts) {
    if (!byType.has(draft.type)) {
      byType.set(draft.type, draft);
    }
  }

  return [...byType.values()];
}

async function resolveInsightDocument(input: {
  userId: string;
  draft: InsightDraft;
  now: Date;
  cacheTtlMs: number;
  generateProse: (draft: InsightProseInput) => Promise<InsightCopy | null>;
}) {
  const cached = await InsightModel.findOne({
    userId: input.userId,
    type: input.draft.type,
  });
  const cacheFresh =
    cached &&
    input.now.getTime() - cached.generatedAt.getTime() <= input.cacheTtlMs &&
    cached.copyVersion === INSIGHT_COPY_VERSION &&
    signalsMatch(cached.deterministicSignal, input.draft.deterministicSignal);

  if (cacheFresh) {
    return cached;
  }

  const copy = await resolveCopy({
    draft: input.draft,
    generateProse: input.generateProse,
  });

  return InsightModel.findOneAndUpdate(
    { userId: input.userId, type: input.draft.type },
    {
      $set: {
        type: input.draft.type,
        headline: copy.headline,
        body: copy.body,
        severity: input.draft.severity,
        deterministicSignal: input.draft.deterministicSignal,
        copyVersion: INSIGHT_COPY_VERSION,
        generatedAt: input.now,
        userId: input.userId,
      },
    },
    { new: true, upsert: true, runValidators: true },
  );
}

export async function getInsights(
  userId: string,
  now = new Date(),
  options: InsightServiceOptions = {},
) {
  const medicationLevels = await getMedicationLevels(userId, now);
  const drafts: InsightDraft[] = [];

  for (const level of medicationLevels) {
    const signal = detectMedicationLevelState({
      currentEstimate: level.currentEstimate,
      peakEstimate: level.peakEstimate,
    });

    if (signal.active) {
      drafts.push({
        type: 'medication_level',
        fallbackHeadline: `${level.compoundName} is near the lower part of the curve`,
        fallbackBody: 'Your relative medication estimate is lower in the current dose cycle.',
        severity: signal.severity,
        deterministicSignal: { ...signal, compoundId: level.compoundId },
      });
    }
  }

  const proteinDraft = await proteinTrendDraft(userId, now);
  if (proteinDraft) {
    drafts.push(proteinDraft);
  }
  drafts.push(...(await doseCycleDrafts(userId, medicationLevels, now)));

  const sideEffect = await sideEffectDraft(userId, now);
  if (sideEffect) {
    drafts.push(sideEffect);
  }

  const stall = await stallDraft(userId, now);
  if (stall) {
    drafts.push(stall);
  }

  const documents = await Promise.all(
    dedupeDraftsByType(drafts).map((draft) =>
      resolveInsightDocument({
        userId,
        draft,
        now,
        cacheTtlMs: options.cacheTtlMs ?? INSIGHT_CACHE_TTL_MS,
        generateProse: options.generateProse ?? generateOpenAIInsightProse,
      }),
    ),
  );

  return documents.map(serializeInsight);
}
