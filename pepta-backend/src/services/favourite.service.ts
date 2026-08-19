// Favourites — list, save, remove.
//
// SAVE IS AN UPSERT ON (userId, key). A star is tapped from several screens
// and can be double-tapped or resent after a timeout; none of those may
// produce a duplicate. Upserting also means re-saving an item the user already
// has refreshes its numbers rather than failing.
//
// REMOVE IS A HARD DELETE, unlike the logs. A log is a record of something
// that happened and is only ever soft-deleted; a favourite is a shortcut the
// user curated, and un-starring it means they want it gone. Keeping tombstones
// would make the list's own count wrong for no benefit.

import type { FavouriteInput, FavouriteResponse } from "@pepta/shared";
import {
  createPresignedGetUrl,
  createPresignedPutUrl,
  deleteS3Object,
  signedUrlExpiresAt,
} from "./s3.service";
import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { FavouriteModel, type FavouriteDocument } from "../models/favourite.model";
import { NotFoundError, ValidationError } from "../lib/errors";

function toResponse(doc: FavouriteDocument, photoUrl: string | null = null): FavouriteResponse {
  return {
    id: doc._id.toString(),
    key: doc.key,
    kind: doc.kind,
    name: doc.name,
    portion: doc.portion ?? "",
    source: doc.source ?? "item",
    ...(doc.photoS3Key ? { photoS3Key: doc.photoS3Key } : {}),
    photoUrl,
    ...(doc.protein != null ? { protein: doc.protein } : {}),
    ...(doc.calories != null ? { calories: doc.calories } : {}),
    ...(doc.fiber != null ? { fiber: doc.fiber } : {}),
    ...(doc.ounces != null ? { ounces: doc.ounces } : {}),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function listFavourites(
  userId: string,
): Promise<{ favourites: FavouriteResponse[]; suggestions: FavouriteResponse[] }> {
  const [mine, seeded] = await Promise.all([
    FavouriteModel.find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec(),
    // Oldest first: the seed order is the order they were written in, and
    // shuffling a fixed set of three between visits makes it feel unstable.
    FavouriteModel.find({ userId: null }).sort({ createdAt: 1 }).exec(),
  ]);
  // Signed on read, never stored: a URL saved in the row would expire in the
  // database and there would be no way to tell a stale one from a real miss.
  const sign = async (docs: FavouriteDocument[]) =>
    Promise.all(
      docs.map(async (doc) =>
        toResponse(
          doc,
          doc.photoS3Key ? await createPresignedGetUrl({ key: doc.photoS3Key }).catch(() => null) : null,
        ),
      ),
    );
  const [favourites, suggestions] = await Promise.all([sign(mine), sign(seeded)]);
  return { favourites, suggestions };
}

export async function saveFavourite(
  userId: string,
  input: FavouriteInput,
): Promise<FavouriteResponse> {
  const doc = await FavouriteModel.findOneAndUpdate(
    { userId: new Types.ObjectId(userId), key: input.key },
    {
      $set: {
        kind: input.kind,
        name: input.name,
        portion: input.portion ?? "",
        source: input.source ?? "item",
        // Set only when supplied, and never unset: re-saving from a screen
        // that does not carry the photo must not wipe one the user attached.
        ...(input.photoS3Key ? { photoS3Key: input.photoS3Key } : {}),
        // Unset rather than write undefined: a food re-saved from a screen
        // that does not know its fiber must not keep a stale figure.
        ...(input.protein != null ? { protein: input.protein } : {}),
        ...(input.calories != null ? { calories: input.calories } : {}),
        ...(input.fiber != null ? { fiber: input.fiber } : {}),
        ...(input.ounces != null ? { ounces: input.ounces } : {}),
      },
      $unset: {
        ...(input.protein == null ? { protein: 1 } : {}),
        ...(input.calories == null ? { calories: 1 } : {}),
        ...(input.fiber == null ? { fiber: 1 } : {}),
        ...(input.ounces == null ? { ounces: 1 } : {}),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).exec();
  const saved = doc as FavouriteDocument;
  const photoUrl = saved.photoS3Key
    ? await createPresignedGetUrl({ key: saved.photoS3Key }).catch(() => null)
    : null;
  return toResponse(saved, photoUrl);
}

/** Idempotent: removing something already gone is not an error. */
export async function removeFavourite(userId: string, key: string): Promise<void> {
  const removed = await FavouriteModel.findOneAndDelete({
    userId: new Types.ObjectId(userId),
    key,
  }).exec();

  // The row is what the user asked to be rid of, so its photo goes with it —
  // otherwise unstarring leaks a file into the bucket that nothing will ever
  // reference again. Best-effort: the favourite is already gone, and failing
  // the request over the cleanup would tell the user a removal did not happen
  // when it did.
  const photoS3Key = (removed as FavouriteDocument | null)?.photoS3Key;
  if (photoS3Key) await deleteS3Object(photoS3Key).catch(() => undefined);
}

/**
 * Throws away a photo that was uploaded and then never attached — a second
 * pick, or a sheet closed without saving.
 *
 * TWO GUARDS, because the client names the key it wants gone. The prefix check
 * is what stops one account deleting another's file; the reference check is
 * what stops a confused client deleting a photo that a saved item is still
 * showing. Neither is a check the caller can be trusted to have done.
 */
export async function discardFavouritePhoto(
  userId: string,
  photoS3Key: string,
): Promise<void> {
  if (!photoS3Key.startsWith(`favourites/${userId}/`)) {
    throw new NotFoundError("Photo not found");
  }

  const inUse = await FavouriteModel.exists({
    userId: new Types.ObjectId(userId),
    photoS3Key,
  }).exec();
  if (inUse) {
    throw new ValidationError("That photo belongs to a saved item");
  }

  await deleteS3Object(photoS3Key);
}

/**
 * Somewhere to put a photo, before the favourite exists.
 *
 * Keyed under the user, so one account can never presign a write into
 * another's prefix. The row is saved afterwards carrying the key, which means
 * an abandoned upload leaves an orphaned object rather than a broken row —
 * the cheaper of the two failures.
 */
export async function createFavouritePhotoIntent(
  userId: string,
  contentType: string,
): Promise<{ uploadUrl: string; photoS3Key: string; expiresAt: string }> {
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const photoS3Key = `favourites/${userId}/${randomUUID()}.${ext}`;
  const uploadUrl = await createPresignedPutUrl({ key: photoS3Key, contentType });
  return { uploadUrl, photoS3Key, expiresAt: signedUrlExpiresAt() };
}
