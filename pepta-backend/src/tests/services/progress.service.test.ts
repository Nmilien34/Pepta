import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  progressPhotoFind: vi.fn(),
  weeklyRetentionFind: vi.fn(),
  measurementList: vi.fn(),
  weightList: vi.fn(),
}));

vi.mock("../../models", () => ({
  ProgressPhotoModel: {
    find: mocks.progressPhotoFind,
  },
  WeeklyRetentionModel: {
    find: mocks.weeklyRetentionFind,
  },
}));

vi.mock("../../services/logs.service", () => ({
  measurementService: {
    list: mocks.measurementList,
  },
  weightLogService: {
    list: mocks.weightList,
  },
}));

import { getProgress } from "../../services/progress.service";

function mongooseLikeDriver() {
  return {
    type: "protein",
    label: "Protein consistency",
    score: 82,
    contribution: 12,
    _doc: {},
    $__: {},
    __parentArray: [],
    parentArray: () => [],
    toObject: () => ({
      type: "protein",
      label: "Protein consistency",
      score: 82,
      contribution: 12,
    }),
  };
}

describe("progress service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.weightList.mockResolvedValue([]);
    mocks.measurementList.mockResolvedValue([]);
    mocks.progressPhotoFind.mockReturnValue({
      sort: vi.fn().mockResolvedValue([]),
    });
    mocks.weeklyRetentionFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([
          {
            weekOf: "2026-06-22",
            score: 82,
            verdict: "steady",
            verdictProse: "Muscle retention is steady.",
            drivers: [mongooseLikeDriver()],
            penaltyApplied: false,
            engineVersion: "retention-v1",
            copyVersion: null,
          },
        ]),
      }),
    });
  });

  it("serializes weekly retention driver subdocuments before schema validation", async () => {
    const result = await getProgress("user-1");

    expect(result.weeklyRetention).toHaveLength(1);
    expect(result.weeklyRetention[0]?.drivers).toEqual([
      {
        type: "protein",
        label: "Protein consistency",
        score: 82,
        contribution: 12,
      },
    ]);
  });
});
