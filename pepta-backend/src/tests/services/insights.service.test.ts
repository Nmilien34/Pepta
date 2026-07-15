import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  doseFindOne: vi.fn(),
  getMedicationLevels: vi.fn(),
  insightFindOne: vi.fn(),
  insightFindOneAndUpdate: vi.fn(),
  mealFind: vi.fn(),
  proteinFind: vi.fn(),
  scheduleFindOne: vi.fn(),
  sideEffectFind: vi.fn(),
  userProfileFindOne: vi.fn(),
  weightFind: vi.fn(),
}));

vi.mock('../../services/medication-level.service', () => ({
  getMedicationLevels: mocks.getMedicationLevels,
}));

vi.mock('../../models', () => ({
  DoseLogModel: {
    findOne: mocks.doseFindOne,
  },
  InsightModel: {
    findOne: mocks.insightFindOne,
    findOneAndUpdate: mocks.insightFindOneAndUpdate,
  },
  MealLogModel: {
    find: mocks.mealFind,
  },
  ProteinLogModel: {
    find: mocks.proteinFind,
  },
  ScheduleModel: {
    findOne: mocks.scheduleFindOne,
  },
  SideEffectLogModel: {
    find: mocks.sideEffectFind,
  },
  UserProfileModel: {
    findOne: mocks.userProfileFindOne,
  },
  WeightLogModel: {
    find: mocks.weightFind,
  },
}));

import { getInsights } from '../../services/insights.service';

const now = new Date('2026-06-21T12:00:00.000Z');

function medicationLevel() {
  return {
    compoundId: 'compound-1',
    compoundName: 'Semaglutide',
    halfLifeDays: 7,
    currentEstimate: 2,
    peakEstimate: 10,
    troughEstimate: 1,
    curve: [],
    nextDoseAt: '2026-06-22T09:00:00.000Z',
    hoursUntilNextDose: 21,
    estimateBasis: 'relative-dose-equivalent' as const,
    engineVersion: 'pk-v2',
  };
}

function insightDocument(overrides: {
  type?: string;
  headline?: string;
  body?: string;
  deterministicSignal?: Record<string, unknown>;
  generatedAt?: Date;
  copyVersion?: string | null;
} = {}) {
  return {
    _id: `insight-${overrides.type ?? 'medication_level'}`,
    type: overrides.type ?? 'medication_level',
    headline: overrides.headline ?? 'Fallback headline',
    body: overrides.body ?? 'Fallback body',
    severity: 'warning',
    deterministicSignal: overrides.deterministicSignal ?? {
      type: 'medication_level',
      active: true,
      severity: 'warning',
      ratioToPeak: 0.2,
      message: 'Medication estimate is in the lower part of the dose curve.',
      compoundId: 'compound-1',
    },
    generatedAt: overrides.generatedAt ?? now,
    copyVersion: overrides.copyVersion ?? 'insight-copy-v1',
  };
}

function mockNoProteinTrend() {
  mocks.userProfileFindOne.mockResolvedValue({ dailyProteinTargetGrams: 100 });
  mocks.mealFind.mockResolvedValue([]);
  mocks.proteinFind.mockResolvedValue([]);
}

function mockCacheWrites() {
  mocks.insightFindOneAndUpdate.mockImplementation((_filter, update: { $set: Record<string, unknown> }) =>
    Promise.resolve({
      _id: `insight-${String(update.$set.type)}`,
      ...update.$set,
    }),
  );
}

describe('insights service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMedicationLevels.mockResolvedValue([medicationLevel()]);
    mocks.insightFindOne.mockResolvedValue(null);
    mocks.doseFindOne.mockReturnValue({
      sort: vi.fn().mockResolvedValue(null),
    });
    mocks.scheduleFindOne.mockResolvedValue(null);
    mocks.sideEffectFind.mockResolvedValue([]);
    mocks.weightFind.mockReturnValue({
      sort: vi.fn().mockResolvedValue([]),
    });
    mockNoProteinTrend();
    mockCacheWrites();
  });

  it('reuses fresh cached copy when the deterministic signal is unchanged', async () => {
    const generateProse = vi.fn();
    mocks.insightFindOne.mockResolvedValue(
      insightDocument({
        headline: 'Cached headline',
        body: 'Cached body',
        generatedAt: new Date('2026-06-21T08:00:00.000Z'),
      }),
    );

    const result = await getInsights('user-1', now, { generateProse });

    expect(generateProse).not.toHaveBeenCalled();
    expect(mocks.insightFindOneAndUpdate).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        headline: 'Cached headline',
        body: 'Cached body',
        copyVersion: 'insight-copy-v1',
      }),
    ]);
  });

  it('generates and caches prose when the cached copy is stale', async () => {
    const generateProse = vi.fn().mockResolvedValue({
      headline: 'AI headline',
      body: 'AI body',
    });
    mocks.insightFindOne.mockResolvedValue(
      insightDocument({
        generatedAt: new Date('2026-06-20T00:00:00.000Z'),
      }),
    );

    const result = await getInsights('user-1', now, { allowAIProse: true, generateProse });

    expect(generateProse).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'medication_level',
        deterministicSignal: expect.objectContaining({ compoundId: 'compound-1' }),
      }),
    );
    expect(mocks.insightFindOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user-1', type: 'medication_level' },
      expect.objectContaining({
        $set: expect.objectContaining({
          headline: 'AI headline',
          body: 'AI body',
          copyVersion: 'insight-copy-v1',
        }),
      }),
      expect.any(Object),
    );
    expect(result[0]).toMatchObject({ headline: 'AI headline', body: 'AI body' });
  });

  it('uses deterministic fallback copy instead of AI prose without consent', async () => {
    const generateProse = vi.fn().mockResolvedValue({
      headline: 'AI headline',
      body: 'AI body',
    });
    mocks.insightFindOne.mockResolvedValue(
      insightDocument({
        generatedAt: new Date('2026-06-20T00:00:00.000Z'),
      }),
    );

    const result = await getInsights('user-1', now, { generateProse });

    expect(generateProse).not.toHaveBeenCalled();
    expect(mocks.insightFindOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user-1', type: 'medication_level' },
      expect.objectContaining({
        $set: expect.objectContaining({
          headline: 'Semaglutide is near the lower part of the curve',
          body: 'Your relative medication estimate is lower in the current dose cycle.',
          copyVersion: 'insight-copy-v1',
        }),
      }),
      expect.any(Object),
    );
    expect(result[0]).toMatchObject({
      headline: 'Semaglutide is near the lower part of the curve',
      body: 'Your relative medication estimate is lower in the current dose cycle.',
    });
  });

  it('surfaces every active deterministic detector in the insight feed', async () => {
    mocks.doseFindOne.mockReturnValue({
      sort: vi.fn().mockResolvedValue({
        compoundId: 'compound-1',
        datetime: new Date('2026-06-15T09:00:00.000Z'),
      }),
    });
    mocks.scheduleFindOne.mockResolvedValue({
      compoundId: 'compound-1',
      intervalDays: 7,
      frequency: 'weekly',
    });
    const proteinWeeks = [
      [{ grams: 700 }],
      [{ grams: 500 }],
      [{ grams: 300 }],
    ];
    mocks.proteinFind.mockImplementation(() => Promise.resolve(proteinWeeks.shift() ?? []));
    mocks.sideEffectFind.mockResolvedValue([
      { datetime: new Date('2026-06-18T09:00:00.000Z'), severity: 4 },
      { datetime: new Date('2026-06-18T12:00:00.000Z'), severity: 5 },
    ]);
    mocks.weightFind.mockReturnValue({
      sort: vi.fn().mockResolvedValue([
        { value: 200, datetime: new Date('2026-06-01T00:00:00.000Z') },
        { value: 199.9, datetime: new Date('2026-06-15T00:00:00.000Z') },
      ]),
    });

    const result = await getInsights('user-1', now, {
      allowAIProse: true,
      generateProse: vi.fn().mockRejectedValue(new Error('OpenAI unavailable')),
    });

    expect(result.map((insight) => insight.type).sort()).toEqual([
      'dose_cycle',
      'medication_level',
      'protein_retention',
      'side_effect_pattern',
      'stall',
    ]);
  });
});
