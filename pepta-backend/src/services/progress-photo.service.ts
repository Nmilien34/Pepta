import {
  progressPhotoSchema,
  progressPhotoUploadIntentResponseSchema,
  type ProgressPhotoConfirmInput,
  type ProgressPhotoInput,
} from "@pepta/shared";
import { NotFoundError } from "../lib/errors";
import {
  ProgressPhotoModel,
  type ProgressPhotoDocument,
} from "../models";
import {
  attachMedia,
  confirmMediaUpload,
  createMediaUploadIntent,
  detachMedia,
  discardMedia,
  getMediaReadDetails,
} from "./media.service";
import { signedUrlExpiresAt } from "./s3.service";

const PENDING_PROGRESS_TTL_MS = 60 * 60 * 1000;

type ReadDetails = Awaited<ReturnType<typeof getMediaReadDetails>>;

function photoLink(photoId: string) {
  return { kind: "progress_photo" as const, resourceId: photoId };
}

function serializePhoto(
  photo: ProgressPhotoDocument,
  details?: ReadDetails,
) {
  return progressPhotoSchema.parse({
    id: photo._id.toString(),
    userId: photo.userId.toString(),
    mediaId: photo.mediaId.toString(),
    captureDate: photo.captureDate,
    contentType: details?.contentType ?? photo.contentType,
    sizeBytes: details?.sizeBytes ?? photo.sizeBytes,
    kind: photo.kind,
    faceFullness: photo.faceFullness,
    status: photo.status,
    ...(details ? { viewUrl: details.viewUrl } : {}),
    createdAt: photo.createdAt.toISOString(),
    updatedAt: photo.updatedAt.toISOString(),
  });
}

async function serializeUploadedPhoto(
  userId: string,
  photo: ProgressPhotoDocument,
) {
  if (photo.status !== "uploaded") {
    throw new NotFoundError("Progress photo not found");
  }
  const details = await getMediaReadDetails(userId, photo.mediaId.toString());
  return serializePhoto(photo, details);
}

export async function createProgressPhotoUploadIntent(
  userId: string,
  input: ProgressPhotoInput,
) {
  const intent = await createMediaUploadIntent(userId, {
    intent: "progress_photo",
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
  });

  let photo: ProgressPhotoDocument;
  try {
    photo = await ProgressPhotoModel.create({
      userId,
      mediaId: intent.mediaId,
      ...input,
      status: "pending_upload",
      expiresAt: new Date(Date.now() + PENDING_PROGRESS_TTL_MS),
    });
  } catch (error) {
    await discardMedia(userId, intent.mediaId).catch(() => undefined);
    throw error;
  }

  return progressPhotoUploadIntentResponseSchema.parse({
    photo: serializePhoto(photo),
    uploadUrl: intent.uploadUrl,
    fields: intent.fields,
    expiresAt: intent.expiresAt,
  });
}

export async function listProgressPhotos(userId: string) {
  const photos = await ProgressPhotoModel.find({
    userId,
    status: "uploaded",
  }).sort({ captureDate: -1 });

  return Promise.all(
    photos.map((photo) => serializeUploadedPhoto(userId, photo)),
  );
}

export async function confirmProgressPhoto(
  userId: string,
  input: ProgressPhotoConfirmInput,
) {
  const now = new Date();
  const existing = await ProgressPhotoModel.findOne({
    _id: input.photoId,
    userId,
  });
  if (!existing || existing.status === "deleted") {
    throw new NotFoundError("Progress photo not found");
  }
  if (existing.status === "uploaded") {
    return serializeUploadedPhoto(userId, existing);
  }
  if (!existing.expiresAt || existing.expiresAt <= now) {
    throw new NotFoundError("Progress photo not found");
  }

  const mediaId = existing.mediaId.toString();
  const photoId = existing._id.toString();
  const link = photoLink(photoId);
  await confirmMediaUpload(userId, { mediaId });
  const details = await getMediaReadDetails(userId, mediaId);
  await attachMedia(userId, mediaId, link);

  let updated: ProgressPhotoDocument | null;
  try {
    updated = await ProgressPhotoModel.findOneAndUpdate(
      {
        _id: input.photoId,
        userId,
        mediaId: existing.mediaId,
        status: "pending_upload",
        expiresAt: { $gt: now },
      },
      {
        $set: {
          status: "uploaded",
          contentType: details.contentType,
          sizeBytes: details.sizeBytes,
        },
        $unset: { expiresAt: 1 },
      },
      { new: true, runValidators: true },
    );
  } catch (error) {
    await detachMedia(userId, mediaId, link).catch(() => undefined);
    throw error;
  }

  if (!updated) {
    const idempotent = await ProgressPhotoModel.findOne({
      _id: input.photoId,
      userId,
      mediaId: existing.mediaId,
      status: "uploaded",
    });
    if (idempotent) return serializePhoto(idempotent, details);
    await detachMedia(userId, mediaId, link);
    throw new NotFoundError("Progress photo not found");
  }

  return serializePhoto(updated, details);
}

export async function getProgressPhotoViewUrl(
  userId: string,
  photoId: string,
) {
  const photo = await ProgressPhotoModel.findOne({
    _id: photoId,
    userId,
    status: "uploaded",
  });
  if (!photo) {
    throw new NotFoundError("Progress photo not found");
  }

  const serialized = await serializeUploadedPhoto(userId, photo);
  return {
    photo: serialized,
    viewUrl: serialized.viewUrl,
    expiresAt: signedUrlExpiresAt(),
  };
}

export async function deleteProgressPhoto(
  userId: string,
  photoId: string,
): Promise<void> {
  const previous = await ProgressPhotoModel.findOneAndUpdate(
    {
      _id: photoId,
      userId,
      status: { $in: ["pending_upload", "uploaded"] },
    },
    { $set: { status: "deleted" }, $unset: { expiresAt: 1 } },
    { new: false },
  );
  if (!previous) {
    throw new NotFoundError("Progress photo not found");
  }

  const mediaId = previous.mediaId.toString();
  try {
    if (previous.status === "uploaded") {
      await detachMedia(userId, mediaId, photoLink(photoId));
    } else {
      await discardMedia(userId, mediaId);
    }
  } catch (error) {
    await ProgressPhotoModel.findOneAndUpdate(
      { _id: photoId, userId, mediaId: previous.mediaId, status: "deleted" },
      {
        $set: {
          status: previous.status,
          ...(previous.expiresAt ? { expiresAt: previous.expiresAt } : {}),
        },
      },
      { new: true, runValidators: true },
    );
    throw error;
  }
}

export async function expirePendingProgressPhotos(
  now = new Date(),
): Promise<number> {
  const result = await ProgressPhotoModel.updateMany(
    { status: "pending_upload", expiresAt: { $lte: now } },
    { $set: { status: "deleted" }, $unset: { expiresAt: 1 } },
  );
  return result.modifiedCount;
}
