import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PepPushCandidate,
  PepPushContext,
} from "../../services/pepPushCopy.service";

const mocks = vi.hoisted(() => ({
  pepMemoryFindOneAndUpdate: vi.fn(),
  pepMemoryFindOne: vi.fn(),
}));

vi.mock("../../models", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../models")>();
  return {
    ...actual,
    PepMemoryModel: {
      findOne: mocks.pepMemoryFindOne,
      findOneAndUpdate: mocks.pepMemoryFindOneAndUpdate,
    },
  };
});

import {
  buildPepMemorySnapshot,
  refreshPepMemory,
  withPepMemoryRefreshAfterLogCreate,
} from "../../services/pepMemory.service";

const now = new Date("2026-06-21T14:00:00.000Z");
const userId = "507f1f77bcf86cd799439011";

function context(overrides: Partial<PepPushContext> = {}): PepPushContext {
  return {
    timezone: "America/New_York",
    streakDays: 4,
    nextDose: {
      compoundName: "Semaglutide",
      nextDoseAt: "2026-06-22T16:00:00.000Z",
      hoursUntilNextDose: 26,
    },
    nutrition: {
      proteinGrams: 42,
      proteinTargetGrams: 130,
      waterOz: 32,
      waterTargetOz: 100,
      fiberGrams: 8,
      fiberTargetGrams: 35,
      calories: 620,
    },
    latestWeight: {
      value: 187.4,
      unit: "lb",
      when: "2026-06-20T12:00:00.000Z",
    },
    goal: {
      weight: 165,
      weightUnit: "lb",
      goalType: "lose_fat",
      goalPace: "steady",
      biggestWorry: "side_effects",
    },
    recentDoses: [{ amount: 0.5, unit: "mg", when: "2026-06-14T16:00:00.000Z" }],
    recentMeals: [
      {
        foodName: "Greek yogurt bowl",
        protein: 28,
        calories: 310,
        when: "2026-06-21T12:00:00.000Z",
      },
    ],
    recentSideEffects: [
      {
        types: ["nausea"],
        severity: 2,
        when: "2026-06-20T18:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

function candidate(
  overrides: Partial<PepPushCandidate> = {},
): PepPushCandidate {
  return {
    priorityId: "side_effect_support",
    importance: "normal",
    pushEligible: false,
    windowKey: "side_effect_support:2026-06-20",
    fallback: {
      title: "Pep: symptom check",
      body: "Pep noticed nausea yesterday. Smaller meals and a quick log after eating can help track the pattern.",
    },
    reason: "The user recently logged a side effect.",
    ...overrides,
  };
}

describe("Pep memory service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No stored summary by default, so the freshness check falls through to
    // generating one.
    mocks.pepMemoryFindOne.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve(null) }),
    });
  });

  it("builds a durable companion snapshot from the latest Pep context", () => {
    const snapshot = buildPepMemorySnapshot({
      context: context(),
      candidate: candidate(),
      lastNotification: {
        priorityId: "dose_due",
        windowKey: "dose_due:2026-06-20",
        sentAt: new Date("2026-06-20T16:00:00.000Z"),
        source: "deterministic",
      },
      aiSummary: null,
      now,
    });

    expect(snapshot).toMatchObject({
      contextVersion: "pep-memory-v1",
      sourceUpdatedAt: now,
      refreshedAt: now,
      nextDoseWindow: {
        compoundName: "Semaglutide",
        nextDoseAt: new Date("2026-06-22T16:00:00.000Z"),
        hoursUntilNextDose: 26,
      },
      nutritionGaps: {
        proteinGramsRemaining: 88,
        waterOzRemaining: 68,
        fiberGramsRemaining: 27,
      },
      recentSideEffects: [
        expect.objectContaining({
          types: ["nausea"],
          severity: 2,
          clinicianPrompt: false,
          supportTip: expect.stringMatching(/smaller meals|log/i),
        }),
      ],
      lastMealPattern: {
        foodName: "Greek yogurt bowl",
        protein: 28,
        calories: 310,
        when: new Date("2026-06-21T12:00:00.000Z"),
      },
      latestWeightTrend: {
        latestValue: 187.4,
        unit: "lb",
        when: new Date("2026-06-20T12:00:00.000Z"),
      },
      currentPriority: {
        priorityId: "side_effect_support",
        importance: "normal",
        pushEligible: false,
      },
      lastNotification: {
        priorityId: "dose_due",
        windowKey: "dose_due:2026-06-20",
        source: "deterministic",
      },
      aiSummary: null,
    });
  });

  it("flags severe side effects with clinician guidance and no dosing instructions", () => {
    const snapshot = buildPepMemorySnapshot({
      context: context({
        recentSideEffects: [
          {
            types: ["nausea"],
            severity: 5,
            when: "2026-06-21T13:15:00.000Z",
          },
        ],
      }),
      candidate: candidate({
        priorityId: "side_effect_clinician",
        importance: "high",
        pushEligible: true,
        windowKey: "side_effect_clinician:2026-06-21",
      }),
      aiSummary: null,
      now,
    });

    expect(snapshot.recentSideEffects[0]).toEqual(
      expect.objectContaining({
        clinicianPrompt: true,
        supportTip: expect.stringMatching(/clinician|urgent/i),
      }),
    );
    expect(snapshot.recentSideEffects[0]?.supportTip).not.toMatch(
      /change.*dose|treat|medication change/i,
    );
  });

  it("upserts memory and stores an AI summary only when the user consented", async () => {
    const generateSummary = vi.fn(async () => "Pep sees a nausea pattern after the last dose.");

    await refreshPepMemory(userId, now, {
      aiPushCopyConsent: true,
      loadContext: async () => context(),
      generateSummary,
    });

    expect(generateSummary).toHaveBeenCalledTimes(1);
    expect(mocks.pepMemoryFindOneAndUpdate).toHaveBeenCalledWith(
      { userId },
      {
        $set: expect.objectContaining({
          aiSummary: {
            text: "Pep sees a nausea pattern after the last dose.",
            generatedAt: now,
            copyVersion: "pep-memory-summary-v1",
          },
        }),
        $setOnInsert: { userId },
      },
      { new: true, upsert: true, runValidators: true },
    );
  });

  it("does not generate an AI summary without explicit consent", async () => {
    const generateSummary = vi.fn(async () => "Should not be used");

    await refreshPepMemory(userId, now, {
      aiPushCopyConsent: false,
      loadContext: async () => context(),
      generateSummary,
    });

    expect(generateSummary).not.toHaveBeenCalled();
    // ...and it must not WRITE aiSummary at all. A refresh that generated no
    // summary has nothing to say about the stored one; $set-ing null here
    // erased the consented summary on every log create and delete, which is
    // why Pep chat almost never had one. Absence is "no news", not "forget".
    const [, update] = mocks.pepMemoryFindOneAndUpdate.mock.calls[0]!;
    expect(update.$set).not.toHaveProperty("aiSummary");
    // A brand-new row still starts explicitly empty rather than undefined.
    expect(update.$setOnInsert).toEqual({ userId, aiSummary: null });
  });

  it("writes the summary through when one was actually generated", async () => {
    await refreshPepMemory(userId, now, {
      aiPushCopyConsent: true,
      loadContext: async () => context(),
      generateSummary: async () => "Two doses logged, protein on track.",
    });

    const [, update] = mocks.pepMemoryFindOneAndUpdate.mock.calls[0]!;
    expect(update.$set.aiSummary).toMatchObject({
      text: "Two doses logged, protein on track.",
    });
    expect(update.$setOnInsert).toEqual({ userId });
  });

  it("refreshes memory after log creation without changing the log response", async () => {
    const refresh = vi.fn(async () => undefined);
    const baseService = {
      create: vi.fn(async () => ({ id: "side-1" })),
      list: vi.fn(async () => []),
      softDelete: vi.fn(async () => ({ id: "side-1", deletedAt: now })),
    };
    const service = withPepMemoryRefreshAfterLogCreate(baseService, refresh);

    const result = await service.create(userId, {
      types: ["constipation"],
      severity: 2,
    });

    expect(result).toEqual({ id: "side-1" });
    expect(refresh).toHaveBeenCalledWith(userId);
  });
});

// The push scheduler sweeps every 15 minutes. Regenerating the summary on
// every sweep meant ~96 paid model calls per consenting user per day to
// restate a narrative that barely moves — and almost none of those sweeps
// produce a notification anyone ever sees.
describe("the AI summary is not rewritten on every sweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reuses a summary that is still current", async () => {
    const generateSummary = vi.fn(async () => "fresh text");
    mocks.pepMemoryFindOne.mockReturnValue({
      select: () => ({
        lean: () =>
          Promise.resolve({
            aiSummary: {
              text: "stored text",
              generatedAt: new Date(now.getTime() - 60 * 60 * 1000),
              copyVersion: "pep-memory-summary-v1",
            },
          }),
      }),
    });

    const snapshot = await refreshPepMemory(userId, now, {
      aiPushCopyConsent: true,
      loadContext: async () => context(),
      generateSummary,
    });

    expect(generateSummary).not.toHaveBeenCalled();
    expect(snapshot.aiSummary?.text).toBe("stored text");
  });

  it("rewrites one that has aged out", async () => {
    const generateSummary = vi.fn(async () => "fresh text");
    mocks.pepMemoryFindOne.mockReturnValue({
      select: () => ({
        lean: () =>
          Promise.resolve({
            aiSummary: {
              text: "stale text",
              generatedAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
              copyVersion: "pep-memory-summary-v1",
            },
          }),
      }),
    });

    const snapshot = await refreshPepMemory(userId, now, {
      aiPushCopyConsent: true,
      loadContext: async () => context(),
      generateSummary,
    });

    expect(generateSummary).toHaveBeenCalledTimes(1);
    expect(snapshot.aiSummary?.text).toBe("fresh text");
  });

  it("rewrites one written by an older prompt version", async () => {
    const generateSummary = vi.fn(async () => "fresh text");
    mocks.pepMemoryFindOne.mockReturnValue({
      select: () => ({
        lean: () =>
          Promise.resolve({
            aiSummary: {
              text: "old version",
              generatedAt: new Date(now.getTime() - 60 * 1000),
              copyVersion: "pep-memory-summary-v0",
            },
          }),
      }),
    });

    await refreshPepMemory(userId, now, {
      aiPushCopyConsent: true,
      loadContext: async () => context(),
      generateSummary,
    });

    expect(generateSummary).toHaveBeenCalledTimes(1);
  });
});
