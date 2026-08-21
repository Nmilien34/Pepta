import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listProgressPhotos: vi.fn(),
  weeklyRetentionFind: vi.fn(),
  measurementList: vi.fn(),
  weightList: vi.fn(),
}));

vi.mock("../../models", () => ({
  WeeklyRetentionModel: {
    find: mocks.weeklyRetentionFind,
  },
}));

vi.mock("../../services/progress-photo.service", () => ({
  listProgressPhotos: mocks.listProgressPhotos,
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
    mocks.listProgressPhotos.mockResolvedValue([]);
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

  it("uses the uploaded-only signed progress-photo reader", async () => {
    mocks.listProgressPhotos.mockResolvedValueOnce([
      {
        id: "507f1f77bcf86cd799439012",
        userId: "507f1f77bcf86cd799439011",
        mediaId: "507f1f77bcf86cd799439013",
        captureDate: "2026-06-22",
        contentType: "image/jpeg",
        sizeBytes: 777,
        kind: "body",
        status: "uploaded",
        viewUrl: "https://signed.example/view",
        createdAt: "2026-06-22T00:00:00.000Z",
        updatedAt: "2026-06-22T00:00:00.000Z",
      },
    ]);

    const result = await getProgress("507f1f77bcf86cd799439011");

    expect(mocks.listProgressPhotos).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439011",
    );
    expect(result.progressPhotos[0]).toMatchObject({
      status: "uploaded",
      viewUrl: "https://signed.example/view",
    });
    expect(result.progressPhotos[0]).not.toHaveProperty("s3Key");
  });
});
