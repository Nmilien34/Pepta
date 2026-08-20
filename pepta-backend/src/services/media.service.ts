import {
  mediaReadyResponseSchema,
  mediaUploadIntentResponseSchema,
  type MediaConfirmInput,
  type MediaIntent,
  type MediaUploadIntentInput,
} from "@pepta/shared";
import { Types } from "mongoose";
import { InternalError, NotFoundError, ValidationError } from "../lib/errors";
import {
  MediaAssetModel,
  type MediaAssetDocument,
  type MediaLinkKind,
} from "../models/media-asset.model";
import { normalizeImage } from "./image-normalization.service";
import {
  createPresignedGetUrl,
  createPresignedPostUpload,
  deleteS3Object,
  getS3ObjectBytes,
  headS3Object,
  putS3Object,
  signedUrlExpiresAt,
} from "./s3.service";

const MIB = 1024 * 1024;
const PENDING_UPLOAD_LIMIT = 20;
const PENDING_BYTES_LIMIT = 100 * MIB;
const PENDING_TTL_MS = 60 * 60 * 1000;
const UNATTACHED_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PIXELS = 24_000_000;

const INTENT_LIMITS: Record<
  MediaIntent,
  { maxBytes: number; maxEdge: number }
> = {
  avatar: { maxBytes: 5 * MIB, maxEdge: 1024 },
  favourite_photo: { maxBytes: 5 * MIB, maxEdge: 1600 },
  progress_photo: { maxBytes: 10 * MIB, maxEdge: 2048 },
  meal_photo: { maxBytes: 10 * MIB, maxEdge: 2048 },
};

const ALLOWED_LINKS: Record<MediaIntent, readonly MediaLinkKind[]> = {
  avatar: ["avatar"],
  progress_photo: ["progress_photo"],
  favourite_photo: ["favourite"],
  meal_photo: ["meal_log", "recipe"],
};

function asObjectId(value: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw new NotFoundError("Media not found");
  }
  return new Types.ObjectId(value);
}

function extensionForContentType(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/heic") return "heic";
  return "jpg";
}

function readyResponse(asset: MediaAssetDocument) {
  return mediaReadyResponseSchema.parse({
    mediaId: asset._id.toString(),
    status: "ready",
  });
}

async function assertPendingQuota(
  userId: Types.ObjectId,
  requestedBytes: number,
  now: Date,
): Promise<void> {
  const activeFilter = {
    userId,
    $or: [
      { status: "pending_upload", expiresAt: { $gt: now } },
      { status: "processing" },
    ],
  };
  const [pendingCount, totals] = await Promise.all([
    MediaAssetModel.countDocuments(activeFilter),
    MediaAssetModel.aggregate<{ totalBytes: number }>([
      { $match: activeFilter },
      { $group: { _id: null, totalBytes: { $sum: "$declaredSizeBytes" } } },
    ]),
  ]);

  if (pendingCount >= PENDING_UPLOAD_LIMIT) {
    throw new ValidationError("Too many pending media uploads");
  }
  if ((totals[0]?.totalBytes ?? 0) + requestedBytes > PENDING_BYTES_LIMIT) {
    throw new ValidationError("Pending media upload quota exceeded");
  }
}

export async function createMediaUploadIntent(
  userId: string,
  input: MediaUploadIntentInput,
) {
  const now = new Date();
  const ownerId = asObjectId(userId);
  const limits = INTENT_LIMITS[input.intent];
  if (input.sizeBytes > limits.maxBytes) {
    throw new ValidationError("Image is too large");
  }

  await assertPendingQuota(ownerId, input.sizeBytes, now);

  const mediaObjectId = new Types.ObjectId();
  const mediaId = mediaObjectId.toString();
  const stagingKey = `pepta/media-staging/${ownerId.toString()}/${mediaId}.${extensionForContentType(
    input.contentType,
  )}`;
  await MediaAssetModel.create({
    _id: mediaObjectId,
    userId: ownerId,
    source: "direct_upload",
    intent: input.intent,
    status: "pending_upload",
    stagingKey,
    declaredContentType: input.contentType,
    declaredSizeBytes: input.sizeBytes,
    links: [],
    expiresAt: new Date(now.getTime() + PENDING_TTL_MS),
  });

  try {
    const upload = await createPresignedPostUpload({
      key: stagingKey,
      contentType: input.contentType,
      maxBytes: limits.maxBytes,
    });
    return mediaUploadIntentResponseSchema.parse({
      mediaId,
      ...upload,
      expiresAt: signedUrlExpiresAt(),
    });
  } catch (error) {
    await MediaAssetModel.findOneAndUpdate(
      { _id: mediaObjectId, userId: ownerId, status: "pending_upload" },
      {
        $set: { status: "deletion_pending", nextDeleteAttemptAt: now },
        $unset: { expiresAt: 1 },
      },
      { new: true },
    );
    throw error;
  }
}

export async function confirmMediaUpload(
  userId: string,
  input: MediaConfirmInput,
) {
  const now = new Date();
  const ownerId = asObjectId(userId);
  const mediaId = asObjectId(input.mediaId);
  const existing = await MediaAssetModel.findOne({
    _id: mediaId,
    userId: ownerId,
    status: "ready",
  });
  if (existing) return readyResponse(existing);

  const processing = await MediaAssetModel.findOneAndUpdate(
    { _id: mediaId, userId: ownerId, status: "pending_upload" },
    { $set: { status: "processing" }, $unset: { expiresAt: 1 } },
    { new: true, runValidators: true },
  );
  if (!processing?.stagingKey) {
    throw new NotFoundError("Media not found");
  }

  const limits = INTENT_LIMITS[processing.intent];
  const storageKey = `pepta/media/${ownerId.toString()}/${input.mediaId}.jpg`;
  try {
    const measured = await headS3Object(processing.stagingKey);
    if (
      measured.contentType !== processing.declaredContentType ||
      measured.contentLength !== processing.declaredSizeBytes
    ) {
      throw new ValidationError("Uploaded image does not match its intent");
    }
    if (!measured.contentLength || measured.contentLength > limits.maxBytes) {
      throw new ValidationError("Image is too large");
    }

    const original = await getS3ObjectBytes(processing.stagingKey);
    if (original.byteLength !== measured.contentLength) {
      throw new ValidationError("Uploaded image does not match its intent");
    }
    const normalized = await normalizeImage(original, {
      maxBytes: limits.maxBytes,
      maxEdge: limits.maxEdge,
      maxPixels: MAX_PIXELS,
    });
    await putS3Object({
      key: storageKey,
      body: normalized.bytes,
      contentType: normalized.contentType,
    });

    let stagingDeleted = true;
    try {
      await deleteS3Object(processing.stagingKey);
    } catch {
      stagingDeleted = false;
    }

    const ready = await MediaAssetModel.findOneAndUpdate(
      { _id: mediaId, userId: ownerId, status: "processing" },
      {
        $set: {
          status: "ready",
          storageKey,
          contentType: normalized.contentType,
          byteSize: normalized.bytes.byteLength,
          width: normalized.width,
          height: normalized.height,
          expiresAt: new Date(now.getTime() + UNATTACHED_TTL_MS),
          ...(stagingDeleted ? {} : { nextDeleteAttemptAt: now }),
        },
        $unset: {
          ...(stagingDeleted ? { stagingKey: 1 } : {}),
          deleteLeaseUntil: 1,
          lastDeleteErrorCode: 1,
        },
      },
      { new: true, runValidators: true },
    );
    if (!ready) {
      throw new InternalError("Media confirmation could not be completed");
    }
    return readyResponse(ready);
  } catch (error) {
    await MediaAssetModel.findOneAndUpdate(
      { _id: mediaId, userId: ownerId, status: "processing" },
      {
        $set: { status: "deletion_pending", nextDeleteAttemptAt: now },
        $unset: { expiresAt: 1, deleteLeaseUntil: 1 },
      },
      { new: true },
    );
    throw error;
  }
}

export async function validateAttachableMedia(
  userId: string,
  mediaId: string,
  linkKind: MediaLinkKind,
): Promise<MediaAssetDocument> {
  const allowedIntents = (Object.entries(ALLOWED_LINKS) as Array<
    [MediaIntent, readonly MediaLinkKind[]]
  >)
    .filter(([, linkKinds]) => linkKinds.includes(linkKind))
    .map(([intent]) => intent);
  const asset = await MediaAssetModel.findOne({
    _id: asObjectId(mediaId),
    userId: asObjectId(userId),
    status: "ready",
    intent: { $in: allowedIntents },
    storageKey: { $exists: true },
  });
  if (!asset) {
    throw new NotFoundError("Media not found");
  }
  return asset;
}

export async function attachMedia(
  userId: string,
  mediaId: string,
  link: { kind: MediaLinkKind; resourceId: string },
): Promise<void> {
  const ownerId = asObjectId(userId);
  const assetId = asObjectId(mediaId);
  const asset = await validateAttachableMedia(userId, mediaId, link.kind);
  const match = { kind: link.kind, resourceId: link.resourceId };
  const attachedAt = new Date();
  const updated = await MediaAssetModel.findOneAndUpdate(
    {
      _id: assetId,
      userId: ownerId,
      status: "ready",
      intent: asset.intent,
      links: { $not: { $elemMatch: match } },
      "links.7": { $exists: false },
    },
    {
      $push: { links: { ...match, attachedAt } },
      $unset: { expiresAt: 1 },
    },
    { new: true, runValidators: true },
  );
  if (updated) return;

  const idempotent = await MediaAssetModel.findOne({
    _id: assetId,
    userId: ownerId,
    status: "ready",
    links: { $elemMatch: match },
  });
  if (!idempotent) {
    throw new NotFoundError("Media not found");
  }
}

export async function detachMedia(
  userId: string,
  mediaId: string,
  link: { kind: MediaLinkKind; resourceId: string },
): Promise<void> {
  const ownerId = asObjectId(userId);
  const assetId = asObjectId(mediaId);
  const updated = await MediaAssetModel.findOneAndUpdate(
    { _id: assetId, userId: ownerId, status: "ready" },
    { $pull: { links: { kind: link.kind, resourceId: link.resourceId } } },
    { new: true, runValidators: true },
  );
  if (!updated || updated.links.length > 0) return;

  await MediaAssetModel.findOneAndUpdate(
    { _id: assetId, userId: ownerId, status: "ready", links: { $size: 0 } },
    {
      $set: { status: "deletion_pending", nextDeleteAttemptAt: new Date() },
      $unset: { expiresAt: 1, deleteLeaseUntil: 1 },
    },
    { new: true },
  );
}

export async function discardMedia(
  userId: string,
  mediaId: string,
): Promise<void> {
  const queued = await MediaAssetModel.findOneAndUpdate(
    {
      _id: asObjectId(mediaId),
      userId: asObjectId(userId),
      status: { $in: ["pending_upload", "processing", "ready"] },
      links: { $size: 0 },
    },
    {
      $set: { status: "deletion_pending", nextDeleteAttemptAt: new Date() },
      $unset: { expiresAt: 1, deleteLeaseUntil: 1 },
    },
    { new: true },
  );
  if (!queued) {
    throw new NotFoundError("Media not found");
  }
}

export async function getMediaViewUrl(
  userId: string,
  mediaId: string,
): Promise<string> {
  const asset = await MediaAssetModel.findOne({
    _id: asObjectId(mediaId),
    userId: asObjectId(userId),
    status: "ready",
    storageKey: { $exists: true },
  });
  if (!asset?.storageKey) {
    throw new NotFoundError("Media not found");
  }
  return createPresignedGetUrl({ key: asset.storageKey });
}

export async function queueAllUserMediaForDeletion(
  userId: string,
): Promise<void> {
  await MediaAssetModel.updateMany(
    { userId: asObjectId(userId), status: { $ne: "deleted" } },
    {
      $set: {
        status: "deletion_pending",
        links: [],
        nextDeleteAttemptAt: new Date(),
      },
      $unset: { expiresAt: 1, deleteLeaseUntil: 1 },
    },
  );
}
