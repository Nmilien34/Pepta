import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOneAndUpdate: vi.fn(),
  updateMany: vi.fn(),
  updateOne: vi.fn(),
  deleteS3Object: vi.fn(),
}));

vi.mock("../../models/media-asset.model", () => ({
  MediaAssetModel: {
    findOneAndUpdate: mocks.findOneAndUpdate,
    updateMany: mocks.updateMany,
    updateOne: mocks.updateOne,
  },
}));

vi.mock("../../services/s3.service", () => ({
  deleteS3Object: mocks.deleteS3Object,
}));

import {
  queueExpiredMedia,
  runDueMediaCleanup,
} from "../../services/media-cleanup.service";

const NOW = new Date("2026-08-19T12:00:00.000Z");
const MEDIA = "507f1f77bcf86cd799439013";

function asset(overrides: Record<string, unknown> = {}) {
  return {
    _id: MEDIA,
    userId: "507f1f77bcf86cd799439011",
    source: "direct_upload",
    intent: "favourite_photo",
    status: "deletion_pending",
    stagingKey: "pepta/media-staging/user/media.png",
    storageKey: "pepta/media/user/media.jpg",
    declaredContentType: "image/png",
    declaredSizeBytes: 2048,
    links: [],
    deleteAttemptCount: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findOneAndUpdate.mockResolvedValue(null);
  mocks.updateMany.mockResolvedValue({ modifiedCount: 0 });
  mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
  mocks.deleteS3Object.mockResolvedValue(undefined);
});

describe("media expiry", () => {
  it("moves abandoned pending and ready assets into the durable deletion queue", async () => {
    mocks.updateMany.mockResolvedValue({ modifiedCount: 3 });

    await expect(queueExpiredMedia(NOW)).resolves.toBe(3);

    expect(mocks.updateMany).toHaveBeenCalledWith(
      {
        status: { $in: ["pending_upload", "ready"] },
        expiresAt: { $lte: NOW },
        links: { $size: 0 },
      },
      {
        $set: { status: "deletion_pending", nextDeleteAttemptAt: NOW },
        $unset: { expiresAt: 1, deleteLeaseUntil: 1 },
      },
    );
  });
});

describe("media cleanup leasing", () => {
  it("deletes only staging bytes while a canonical image remains ready", async () => {
    mocks.findOneAndUpdate.mockResolvedValueOnce(
      asset({ status: "ready", deleteAttemptCount: 1 }),
    );

    await expect(runDueMediaCleanup({ now: NOW, limit: 1 })).resolves.toEqual({
      attempted: 1,
      succeeded: 1,
      failed: 0,
    });

    expect(mocks.deleteS3Object).toHaveBeenCalledWith(
      "pepta/media-staging/user/media.png",
    );
    expect(mocks.deleteS3Object).not.toHaveBeenCalledWith(
      "pepta/media/user/media.jpg",
    );
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { _id: MEDIA, status: "ready" },
      {
        $unset: {
          stagingKey: 1,
          deleteLeaseUntil: 1,
          nextDeleteAttemptAt: 1,
          lastDeleteErrorCode: 1,
        },
      },
    );
  });

  it("marks a deletion-pending asset deleted only after all stored keys are removed", async () => {
    mocks.findOneAndUpdate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(asset());

    await expect(runDueMediaCleanup({ now: NOW, limit: 1 })).resolves.toEqual({
      attempted: 1,
      succeeded: 1,
      failed: 0,
    });

    expect(mocks.deleteS3Object.mock.calls.map(([key]) => key)).toEqual([
      "pepta/media-staging/user/media.png",
      "pepta/media/user/media.jpg",
    ]);
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { _id: MEDIA, status: "deletion_pending" },
      {
        $set: { status: "deleted", deletedAt: NOW, links: [] },
        $unset: {
          stagingKey: 1,
          storageKey: 1,
          deleteLeaseUntil: 1,
          nextDeleteAttemptAt: 1,
          lastDeleteErrorCode: 1,
          expiresAt: 1,
        },
      },
    );
  });

  it("backs off and keeps cleanup authority when S3 deletion fails", async () => {
    mocks.findOneAndUpdate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(asset({ deleteAttemptCount: 2 }));
    mocks.deleteS3Object.mockRejectedValue(
      Object.assign(new Error("slow down"), { name: "SlowDown" }),
    );

    await expect(runDueMediaCleanup({ now: NOW, limit: 1 })).resolves.toEqual({
      attempted: 1,
      succeeded: 0,
      failed: 1,
    });

    expect(mocks.updateOne).toHaveBeenCalledWith(
      { _id: MEDIA, status: "deletion_pending" },
      {
        $set: {
          lastDeleteErrorCode: "SlowDown",
          nextDeleteAttemptAt: new Date("2026-08-19T12:02:00.000Z"),
        },
        $unset: { deleteLeaseUntil: 1 },
      },
    );
  });

  it("parks exhausted work for an operator instead of deleting the row", async () => {
    mocks.findOneAndUpdate
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(asset({ deleteAttemptCount: 12 }));
    mocks.deleteS3Object.mockRejectedValue(new Error("still down"));

    await runDueMediaCleanup({ now: NOW, limit: 1 });

    expect(mocks.updateOne).toHaveBeenCalledWith(
      { _id: MEDIA, status: "deletion_pending" },
      {
        $set: { lastDeleteErrorCode: "RETRYABLE_EXHAUSTED" },
        $unset: { deleteLeaseUntil: 1, nextDeleteAttemptAt: 1 },
      },
    );
  });

  it("does no work when another instance owns every eligible lease", async () => {
    mocks.findOneAndUpdate.mockResolvedValue(null);

    await expect(runDueMediaCleanup({ now: NOW, limit: 2 })).resolves.toEqual({
      attempted: 0,
      succeeded: 0,
      failed: 0,
    });
    expect(mocks.deleteS3Object).not.toHaveBeenCalled();
  });
});
