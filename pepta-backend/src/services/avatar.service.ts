import { avatarViewUrlResponseSchema } from "@pepta/shared";
import { Types } from "mongoose";
import { InternalError, NotFoundError } from "../lib/errors";
import { UserModel, type UserDocument } from "../models";
import {
  attachMedia,
  detachMedia,
  getMediaViewUrl,
  validateAttachableMedia,
} from "./media.service";
import { signedUrlExpiresAt } from "./s3.service";

const avatarLink = (userId: string) => ({
  kind: "avatar" as const,
  resourceId: userId,
});

export async function setAvatarMedia(
  userId: string,
  mediaId: string,
): Promise<UserDocument> {
  await validateAttachableMedia(userId, mediaId, "avatar");

  const user = await UserModel.findById(userId);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  const previousMediaId = user.avatarMediaId?.toString();
  const link = avatarLink(userId);
  await attachMedia(userId, mediaId, link);

  if (previousMediaId === mediaId) {
    return user;
  }

  const currentMediaMatch = previousMediaId
    ? new Types.ObjectId(previousMediaId)
    : { $exists: false };
  const updatedUser = await UserModel.findOneAndUpdate(
    {
      _id: new Types.ObjectId(userId),
      avatarMediaId: currentMediaMatch,
    },
    {
      $set: { avatarMediaId: new Types.ObjectId(mediaId) },
      $unset: { providerAvatarFingerprint: 1 },
    },
    { new: true, runValidators: true },
  );

  if (!updatedUser) {
    await detachMedia(userId, mediaId, link);
    throw new InternalError("Avatar could not be updated");
  }

  if (previousMediaId) {
    await detachMedia(userId, previousMediaId, link);
  }

  return updatedUser;
}

export async function getAvatarViewUrl(userId: string) {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  const mediaId = user.avatarMediaId?.toString();
  if (!mediaId) {
    return avatarViewUrlResponseSchema.parse({
      viewUrl: null,
      expiresAt: null,
    });
  }

  return avatarViewUrlResponseSchema.parse({
    viewUrl: await getMediaViewUrl(userId, mediaId),
    expiresAt: signedUrlExpiresAt(),
  });
}
