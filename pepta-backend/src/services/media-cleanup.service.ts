import type { FilterQuery } from "mongoose";
import {
  MediaAssetModel,
  type MediaAssetDocument,
  type MediaStatus,
} from "../models/media-asset.model";
import { deleteS3Object } from "./s3.service";

const DELETE_LEASE_MS = 5 * 60 * 1000;
const RETRY_BASE_MS = 60 * 1000;
const RETRY_MAX_MS = 24 * 60 * 60 * 1000;
const MAX_DELETE_ATTEMPTS = 12;

type CleanupResult = {
  attempted: number;
  succeeded: number;
  failed: number;
};

function leaseFilter(status: MediaStatus, now: Date): FilterQuery<MediaAssetDocument> {
  return {
    status,
    nextDeleteAttemptAt: { $lte: now },
    lastDeleteErrorCode: { $ne: "RETRYABLE_EXHAUSTED" },
    $or: [
      { deleteLeaseUntil: { $exists: false } },
      { deleteLeaseUntil: { $lte: now } },
    ],
    ...(status === "ready" ? { stagingKey: { $exists: true } } : {}),
  };
}

async function leaseNext(
  status: "ready" | "deletion_pending",
  now: Date,
): Promise<MediaAssetDocument | null> {
  return MediaAssetModel.findOneAndUpdate(
    leaseFilter(status, now),
    {
      $set: { deleteLeaseUntil: new Date(now.getTime() + DELETE_LEASE_MS) },
      $inc: { deleteAttemptCount: 1 },
    },
    { new: true, sort: { nextDeleteAttemptAt: 1, _id: 1 } },
  );
}

function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const explicitCode =
      "code" in error && typeof error.code === "string" ? error.code : null;
    const errorName =
      "name" in error && typeof error.name === "string" ? error.name : null;
    const candidate = errorName && errorName !== "Error" ? errorName : explicitCode;
    if (candidate) return candidate.slice(0, 120);
  }
  return "UNKNOWN";
}

async function recordFailure(
  asset: MediaAssetDocument,
  now: Date,
  error: unknown,
): Promise<void> {
  const filter = { _id: asset._id, status: asset.status };
  if (asset.deleteAttemptCount >= MAX_DELETE_ATTEMPTS) {
    await MediaAssetModel.updateOne(filter, {
      $set: { lastDeleteErrorCode: "RETRYABLE_EXHAUSTED" },
      $unset: { deleteLeaseUntil: 1, nextDeleteAttemptAt: 1 },
    });
    return;
  }

  const delayMs = Math.min(
    RETRY_BASE_MS * 2 ** Math.max(0, asset.deleteAttemptCount - 1),
    RETRY_MAX_MS,
  );
  await MediaAssetModel.updateOne(filter, {
    $set: {
      lastDeleteErrorCode: errorCode(error),
      nextDeleteAttemptAt: new Date(now.getTime() + delayMs),
    },
    $unset: { deleteLeaseUntil: 1 },
  });
}

async function deleteReadyStaging(asset: MediaAssetDocument): Promise<void> {
  if (asset.stagingKey) await deleteS3Object(asset.stagingKey);
  await MediaAssetModel.updateOne(
    { _id: asset._id, status: "ready" },
    {
      $unset: {
        stagingKey: 1,
        deleteLeaseUntil: 1,
        nextDeleteAttemptAt: 1,
        lastDeleteErrorCode: 1,
      },
    },
  );
}

async function deletePendingAsset(
  asset: MediaAssetDocument,
  now: Date,
): Promise<void> {
  if (asset.stagingKey) await deleteS3Object(asset.stagingKey);
  if (asset.storageKey) await deleteS3Object(asset.storageKey);
  await MediaAssetModel.updateOne(
    { _id: asset._id, status: "deletion_pending" },
    {
      $set: { status: "deleted", deletedAt: now, links: [] },
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
}

export async function queueExpiredMedia(now = new Date()): Promise<number> {
  const result = await MediaAssetModel.updateMany(
    {
      status: { $in: ["pending_upload", "processing", "ready"] },
      expiresAt: { $lte: now },
      links: { $size: 0 },
    },
    {
      $set: { status: "deletion_pending", nextDeleteAttemptAt: now },
      $unset: { expiresAt: 1, deleteLeaseUntil: 1 },
    },
  );
  return result.modifiedCount;
}

export async function runDueMediaCleanup(options: {
  now?: Date;
  limit?: number;
} = {}): Promise<CleanupResult> {
  const now = options.now ?? new Date();
  const limit = Math.max(0, Math.min(options.limit ?? 25, 100));
  const result: CleanupResult = { attempted: 0, succeeded: 0, failed: 0 };

  for (let index = 0; index < limit; index += 1) {
    const asset =
      (await leaseNext("ready", now)) ??
      (await leaseNext("deletion_pending", now));
    if (!asset) break;

    result.attempted += 1;
    try {
      if (asset.status === "ready") {
        await deleteReadyStaging(asset);
      } else {
        await deletePendingAsset(asset, now);
      }
      result.succeeded += 1;
    } catch (error) {
      await recordFailure(asset, now, error);
      result.failed += 1;
    }
  }

  return result;
}
