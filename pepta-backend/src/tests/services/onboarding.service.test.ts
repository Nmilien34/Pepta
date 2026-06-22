import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SideEffectType } from "@pepta/shared";

const mocks = vi.hoisted(() => ({
  compoundFindOneAndUpdate: vi.fn(),
  doseFindOneAndUpdate: vi.fn(),
  medicationFindById: vi.fn(),
  profileFindOneAndUpdate: vi.fn(),
  scheduleFindOneAndUpdate: vi.fn(),
  userFindByIdAndUpdate: vi.fn(),
  weightFindOneAndUpdate: vi.fn(),
}));

vi.mock("../../models", () => ({
  CompoundModel: {
    findOneAndUpdate: mocks.compoundFindOneAndUpdate,
  },
  DoseLogModel: {
    findOneAndUpdate: mocks.doseFindOneAndUpdate,
  },
  MedicationCatalogModel: {
    findById: mocks.medicationFindById,
  },
  ScheduleModel: {
    findOneAndUpdate: mocks.scheduleFindOneAndUpdate,
  },
  UserModel: {
    findByIdAndUpdate: mocks.userFindByIdAndUpdate,
  },
  UserProfileModel: {
    findOneAndUpdate: mocks.profileFindOneAndUpdate,
  },
  WeightLogModel: {
    findOneAndUpdate: mocks.weightFindOneAndUpdate,
  },
}));

import { completeOnboarding } from "../../services/onboarding.service";

type ModelUpdate = {
  $set?: Record<string, unknown>;
  $setOnInsert?: Record<string, unknown>;
};

type MockDocument = Record<string, unknown> & {
  toObject: () => Record<string, unknown>;
};

const now = new Date("2026-06-21T12:00:00.000Z");
const userId = "user-1";

const baseProfile = {
  sex: "female" as const,
  ageYears: 99,
  dateOfBirth: "1986-06-21",
  genderIdentity: "woman" as const,
  medicationStatus: "active" as const,
  height: 65,
  heightUnit: "in" as const,
  currentWeight: 180,
  weightUnit: "lb" as const,
  goalWeight: 150,
  goalWeightUnit: "lb" as const,
  goalPace: "steady" as const,
  activityLevel: "light" as const,
  trainingStatus: "beginner" as const,
  goalType: "lose_fat" as const,
  biggestWorry: "side_effects" as const,
  doseUnitPreference: "mg" as const,
  onboardingComplete: false,
  journeyStartDate: "2026-06-01",
  timezone: "America/New_York",
  sideEffectBaseline: [] as SideEffectType[],
};

function document(value: Record<string, unknown>): MockDocument {
  return {
    _id: value.id,
    ...value,
    toObject: () => value,
  };
}

function mergeUpdate(update: ModelUpdate): Record<string, unknown> {
  return {
    ...(update.$setOnInsert ?? {}),
    ...(update.$set ?? {}),
  };
}

function getCallUpdate(
  mock: typeof mocks.profileFindOneAndUpdate,
  index = 0,
): ModelUpdate {
  const call = mock.mock.calls[index] as
    | [unknown, ModelUpdate, unknown]
    | undefined;
  expect(call).toBeDefined();
  return call?.[1] ?? {};
}

function mockSuccessfulWrites() {
  mocks.medicationFindById.mockResolvedValue({
    _id: "catalog-1",
    name: "Semaglutide",
    drugClass: "glp_1",
    route: "injection",
    halfLifeDays: 7,
    doseUnit: "mg",
    defaultDose: 0.25,
    defaultFrequency: "weekly",
  });
  mocks.profileFindOneAndUpdate.mockImplementation(
    (_filter: unknown, update: ModelUpdate) =>
      Promise.resolve(
        document({
          id: "profile-1",
          userId,
          ...baseProfile,
          ...mergeUpdate(update),
          createdAt: "2026-06-21T00:00:00.000Z",
          updatedAt: "2026-06-21T00:00:00.000Z",
        }),
      ),
  );
  mocks.compoundFindOneAndUpdate.mockImplementation(
    (_filter: unknown, update: ModelUpdate) =>
      Promise.resolve(
        document({
          id: "compound-1",
          userId,
          medicationCatalogId: "catalog-1",
          name: "Semaglutide",
          drugClass: "glp_1",
          route: "injection",
          halfLifeDays: 7,
          doseUnit: "mg",
          plannedDose: 0.25,
          startDate: "2026-06-01",
          status: "active",
          deletedAt: null,
          ...mergeUpdate(update),
          createdAt: "2026-06-21T00:00:00.000Z",
          updatedAt: "2026-06-21T00:00:00.000Z",
        }),
      ),
  );
  mocks.scheduleFindOneAndUpdate.mockResolvedValue(
    document({ id: "schedule-1" }),
  );
  mocks.doseFindOneAndUpdate.mockResolvedValue(document({ id: "dose-1" }));
  mocks.weightFindOneAndUpdate.mockResolvedValue(document({ id: "weight-1" }));
  mocks.userFindByIdAndUpdate.mockResolvedValue(document({ id: userId }));
}

function activeOnboardingInput() {
  return {
    profile: baseProfile,
    compound: {
      medicationCatalogId: "catalog-1",
      name: "Semaglutide",
      drugClass: "glp_1" as const,
      route: "injection" as const,
      halfLifeDays: 7,
      doseUnit: "mg" as const,
      plannedDose: 0.25,
      startDate: "2026-06-01",
      status: "active" as const,
    },
    schedule: {
      frequency: "weekly" as const,
      daysOfWeek: [1],
      nextDoseAt: "2026-06-22T13:00:00.000Z",
      active: true,
    },
    lastDose: {
      amount: 0.25,
      unit: "mg" as const,
      injectionSite: "abdomen_left" as const,
      datetime: "2026-06-15T13:00:00.000Z",
    },
    baselineWeight: {
      value: 185,
      unit: "lb" as const,
      datetime: "2026-06-01T00:00:00.000Z",
    },
    sideEffectBaseline: ["constipation" as const],
    legalAcceptance: {
      termsVersion: "2026-06",
      privacyVersion: "2026-06",
      acceptedAt: "2026-06-21T00:00:00.000Z",
    },
  };
}

describe("onboarding service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mockSuccessfulWrites();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates active medication setup, starter logs, legal acceptance, and result payload", async () => {
    const result = await completeOnboarding(userId, activeOnboardingInput());

    const profileUpdate =
      getCallUpdate(mocks.profileFindOneAndUpdate).$set ?? {};
    expect(profileUpdate).toEqual(
      expect.objectContaining({
        ageYears: 40,
        medicationStatus: "active",
        sideEffectBaseline: ["constipation"],
        dailyWaterTargetOz: 106,
        dailyFiberTargetGrams: 38,
        dailyStepTarget: 7000,
      }),
    );

    expect(mocks.medicationFindById).toHaveBeenCalledWith("catalog-1");
    expect(mergeUpdate(getCallUpdate(mocks.compoundFindOneAndUpdate))).toEqual(
      expect.objectContaining({
        route: "injection",
        medicationCatalogId: "catalog-1",
      }),
    );
    expect(mocks.scheduleFindOneAndUpdate).toHaveBeenCalled();
    expect(mocks.doseFindOneAndUpdate).toHaveBeenCalled();
    expect(mocks.weightFindOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(getCallUpdate(mocks.userFindByIdAndUpdate).$set).toEqual(
      expect.objectContaining({
        onboardingComplete: true,
        legalAcceptance: {
          termsVersion: "2026-06",
          privacyVersion: "2026-06",
          acceptedAt: new Date("2026-06-21T00:00:00.000Z"),
        },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        lifestyleTargets: expect.objectContaining({
          dailyWaterTargetOz: 106,
          dailyFiberTargetGrams: 38,
          dailyStepTarget: 7000,
        }),
        planHighlights: expect.arrayContaining([expect.any(String)]),
      }),
    );
  });

  it("skips compound, schedule, and dose setup when medication is starting soon", async () => {
    const input = {
      ...activeOnboardingInput(),
      profile: {
        ...baseProfile,
        medicationStatus: "starting_soon" as const,
      },
      compound: undefined,
      schedule: undefined,
      lastDose: undefined,
    };

    const result = await completeOnboarding(userId, input);

    expect(mocks.compoundFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.scheduleFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.doseFindOneAndUpdate).not.toHaveBeenCalled();
    expect(result.planHighlights.length).toBeGreaterThan(0);
  });
});
