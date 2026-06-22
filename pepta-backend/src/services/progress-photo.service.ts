import {
  progressPhotoSchema,
  progressPhotoUploadIntentResponseSchema,
  type ProgressPhotoConfirmInput,
  type ProgressPhotoInput,
} from '@pepta/shared';
import { env } from '../config/env';
import { NotFoundError } from '../lib/errors';
import { ProgressPhotoModel } from '../models';

function publicBaseUrl(): string {
  return env.aws.bucketName
    ? `https://${env.aws.bucketName}.s3.${env.aws.region ?? 'us-east-1'}.amazonaws.com`
    : 'https://pepta.local';
}

function serializePhoto(photo: {
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
}) {
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
    viewUrl: `${publicBaseUrl()}/${encodeURIComponent(photo.s3Key)}`,
    createdAt: photo.createdAt.toISOString(),
    updatedAt: photo.updatedAt.toISOString(),
  });
}

export async function createProgressPhotoUploadIntent(userId: string, input: ProgressPhotoInput) {
  const s3Key = `progress-photos/${userId}/${input.captureDate}-${Date.now()}`;
  const photo = await ProgressPhotoModel.create({
    ...input,
    userId,
    s3Key,
    status: 'pending_upload',
  });
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  return progressPhotoUploadIntentResponseSchema.parse({
    photo: serializePhoto(photo),
    uploadUrl: `${publicBaseUrl()}/${encodeURIComponent(s3Key)}?upload=1`,
    expiresAt: expiresAt.toISOString(),
  });
}

export async function listProgressPhotos(userId: string) {
  const photos = await ProgressPhotoModel.find({ userId, status: { $ne: 'deleted' } }).sort({
    captureDate: -1,
  });

  return photos.map(serializePhoto);
}

export async function confirmProgressPhoto(userId: string, input: ProgressPhotoConfirmInput) {
  const photo = await ProgressPhotoModel.findOneAndUpdate(
    { _id: input.photoId, userId },
    {
      $set: {
        status: 'uploaded',
        ...(input.sizeBytes ? { sizeBytes: input.sizeBytes } : {}),
      },
    },
    { new: true, runValidators: true },
  );

  if (!photo) {
    throw new NotFoundError('Progress photo not found');
  }

  return serializePhoto(photo);
}
