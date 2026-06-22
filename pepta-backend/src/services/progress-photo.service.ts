import {
  progressPhotoSchema,
  progressPhotoUploadIntentResponseSchema,
  type ProgressPhotoConfirmInput,
  type ProgressPhotoInput,
} from "@pepta/shared";
import { randomUUID } from "node:crypto";
import { NotFoundError } from "../lib/errors";
import { ProgressPhotoModel } from "../models";
import {
  createPresignedGetUrl,
  createPresignedPutUrl,
  deleteS3Object,
  signedUrlExpiresAt,
} from "./s3.service";

function extensionForContentType(
  contentType: ProgressPhotoInput["contentType"],
): string {
  if (contentType === "image/png") {
    return "png";
  }

  if (contentType === "image/heic") {
    return "heic";
  }

  if (contentType === "image/webp") {
    return "webp";
  }

  return "jpg";
}

export function buildProgressPhotoObjectKey(input: {
  userId: string;
  contentType: ProgressPhotoInput["contentType"];
  uploadId?: string;
}): string {
  return `pepta/progress-photos/${input.userId}/${input.uploadId ?? randomUUID()}.${extensionForContentType(
    input.contentType,
  )}`;
}

function serializePhoto(
  photo: {
    _id: unknown;
    userId: unknown;
    captureDate: string;
    contentType: string;
    sizeBytes?: number;
    kind: string;
    faceFullness?: number;
    s3Key: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  },
  viewUrl?: string,
) {
  return progressPhotoSchema.parse({
    id: String(photo._id),
    userId: String(photo.userId),
    captureDate: photo.captureDate,
    contentType: photo.contentType,
    sizeBytes: photo.sizeBytes,
    kind: photo.kind,
    faceFullness: photo.faceFullness,
    s3Key: photo.s3Key,
    status: photo.status,
    ...(viewUrl ? { viewUrl } : {}),
    createdAt: photo.createdAt.toISOString(),
    updatedAt: photo.updatedAt.toISOString(),
  });
}

export async function createProgressPhotoUploadIntent(
  userId: string,
  input: ProgressPhotoInput,
) {
  const s3Key = buildProgressPhotoObjectKey({
    userId,
    contentType: input.contentType,
  });
  const uploadUrl = await createPresignedPutUrl({
    key: s3Key,
    contentType: input.contentType,
  });
  const photo = await ProgressPhotoModel.create({
    ...input,
    userId,
    s3Key,
    status: "pending_upload",
  });

  return progressPhotoUploadIntentResponseSchema.parse({
    photo: serializePhoto(photo),
    uploadUrl,
    expiresAt: signedUrlExpiresAt(),
  });
}

export async function listProgressPhotos(userId: string) {
  const photos = await ProgressPhotoModel.find({
    userId,
    status: "uploaded",
  }).sort({
    captureDate: -1,
  });

  return Promise.all(
    photos.map(async (photo) =>
      serializePhoto(photo, await createPresignedGetUrl({ key: photo.s3Key })),
    ),
  );
}

export async function confirmProgressPhoto(
  userId: string,
  input: ProgressPhotoConfirmInput,
) {
  const photo = await ProgressPhotoModel.findOneAndUpdate(
    { _id: input.photoId, userId },
    {
      $set: {
        status: "uploaded",
        ...(input.sizeBytes ? { sizeBytes: input.sizeBytes } : {}),
      },
    },
    { new: true, runValidators: true },
  );

  if (!photo) {
    throw new NotFoundError("Progress photo not found");
  }

  return serializePhoto(photo);
}

export async function getProgressPhotoViewUrl(userId: string, photoId: string) {
  const photo = await ProgressPhotoModel.findOne({
    _id: photoId,
    userId,
    status: "uploaded",
  });

  if (!photo) {
    throw new NotFoundError("Progress photo not found");
  }

  return {
    photo: serializePhoto(photo),
    viewUrl: await createPresignedGetUrl({ key: photo.s3Key }),
    expiresAt: signedUrlExpiresAt(),
  };
}

export async function deleteProgressPhoto(
  userId: string,
  photoId: string,
): Promise<void> {
  const photo = await ProgressPhotoModel.findOneAndUpdate(
    { _id: photoId, userId },
    { $set: { status: "deleted" } },
    { new: true },
  );

  if (!photo) {
    throw new NotFoundError("Progress photo not found");
  }

  await deleteS3Object(photo.s3Key);
}
