import {
  avatarUploadIntentResponseSchema,
  avatarViewUrlResponseSchema,
  type AvatarConfirmRequest,
  type AvatarUploadIntentRequest,
} from "@pepta/shared";
import { randomUUID } from "node:crypto";
import { NotFoundError, ValidationError } from "../lib/errors";
import { UserModel } from "../models";
import {
  createPresignedGetUrl,
  createPresignedPutUrl,
  deleteS3Object,
  signedUrlExpiresAt,
} from "./s3.service";
import { serializeUser } from "./user.service";

type AvatarContentType = AvatarUploadIntentRequest["contentType"];

function extensionForContentType(contentType: AvatarContentType): string {
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

function avatarKeyPrefix(userId: string): string {
  return `pepta/avatars/${userId}/`;
}

export function buildAvatarObjectKey(input: {
  userId: string;
  contentType: AvatarContentType;
  uploadId?: string;
}): string {
  return `${avatarKeyPrefix(input.userId)}${
    input.uploadId ?? randomUUID()
  }.${extensionForContentType(input.contentType)}`;
}

export async function createAvatarUploadIntent(
  userId: string,
  input: AvatarUploadIntentRequest,
) {
  const key = buildAvatarObjectKey({
    userId,
    contentType: input.contentType,
  });
  const uploadUrl = await createPresignedPutUrl({
    key,
    contentType: input.contentType,
  });

  return avatarUploadIntentResponseSchema.parse({
    key,
    uploadUrl,
    expiresAt: signedUrlExpiresAt(),
  });
}

export async function confirmAvatarUpload(
  userId: string,
  input: AvatarConfirmRequest,
) {
  if (!input.key.startsWith(avatarKeyPrefix(userId))) {
    throw new ValidationError("Avatar upload key does not belong to this user");
  }

  const user = await UserModel.findById(userId);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  const previousKey = user.avatarKey;
  user.avatarKey = input.key;
  await user.save();

  if (previousKey && previousKey !== input.key) {
    deleteS3Object(previousKey).catch(() => undefined);
  }

  return serializeUser(user);
}

export async function getAvatarViewUrl(userId: string) {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  if (!user.avatarKey) {
    return avatarViewUrlResponseSchema.parse({
      viewUrl: null,
      expiresAt: null,
    });
  }

  return avatarViewUrlResponseSchema.parse({
    viewUrl: await createPresignedGetUrl({ key: user.avatarKey }),
    expiresAt: signedUrlExpiresAt(),
  });
}
