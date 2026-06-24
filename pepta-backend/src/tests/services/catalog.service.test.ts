import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compoundFindOneAndUpdate: vi.fn(),
  scheduleFindOneAndUpdate: vi.fn(),
}));

vi.mock("../../models", () => ({
  CompoundModel: {
    findOneAndUpdate: mocks.compoundFindOneAndUpdate,
  },
  CycleModel: {},
  MedicationCatalogModel: {},
  ResearchArticleModel: {},
  ScheduleModel: {
    findOneAndUpdate: mocks.scheduleFindOneAndUpdate,
  },
}));

import { updateCompound, updateSchedule } from "../../services/catalog.service";

type ModelUpdate = {
  $set?: Record<string, unknown>;
};

function document(value: Record<string, unknown>) {
  return {
    _id: value.id,
    ...value,
    toObject: () => value,
  };
}

describe("catalog edit services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.compoundFindOneAndUpdate.mockResolvedValue(
      document({
        id: "compound-1",
        userId: "user-1",
        medicationCatalogId: "catalog-1",
        name: "Rybelsus",
        drugClass: "glp_1",
        route: "oral",
        halfLifeDays: 7,
        doseUnit: "mg",
        plannedDose: 7,
        startDate: "2026-06-21",
        status: "active",
        notes: "Updated",
        deletedAt: null,
        createdAt: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:00:00.000Z",
      }),
    );
    mocks.scheduleFindOneAndUpdate.mockResolvedValue(
      document({
        id: "schedule-1",
        userId: "user-1",
        compoundId: "compound-1",
        frequency: "biweekly",
        intervalDays: 14,
        daysOfWeek: [1],
        nextDoseAt: "2026-07-05T13:00:00.000Z",
        active: true,
        createdAt: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:00:00.000Z",
      }),
    );
  });

  it("updates compound medication details within the current user scope", async () => {
    const result = await updateCompound("user-1", "compound-1", {
      name: "Rybelsus",
      route: "oral",
      plannedDose: 7,
      notes: "Updated",
    });

    expect(mocks.compoundFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: "compound-1", userId: "user-1", deletedAt: null },
      {
        $set: {
          name: "Rybelsus",
          route: "oral",
          plannedDose: 7,
          notes: "Updated",
        },
      },
      expect.objectContaining({ new: true, runValidators: true }),
    );
    expect(result.route).toBe("oral");
  });

  it("updates schedule timing fields within the current user scope", async () => {
    const result = await updateSchedule("user-1", "schedule-1", {
      frequency: "biweekly",
      intervalDays: 14,
      daysOfWeek: [1],
      nextDoseAt: "2026-07-05T13:00:00.000Z",
    });

    const call = mocks.scheduleFindOneAndUpdate.mock.calls[0] as
      | [unknown, ModelUpdate, unknown]
      | undefined;
    expect(call).toBeDefined();
    expect(call?.[0]).toEqual({ _id: "schedule-1", userId: "user-1" });
    expect(call?.[1].$set).toEqual({
      frequency: "biweekly",
      intervalDays: 14,
      daysOfWeek: [1],
      nextDoseAt: new Date("2026-07-05T13:00:00.000Z"),
    });
    expect(result.frequency).toBe("biweekly");
  });
});
