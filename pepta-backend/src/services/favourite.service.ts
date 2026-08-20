// Favourites are idempotent upserts on (userId, key). Photos are referenced
// only through owner-scoped MediaAsset ids; storage keys never enter this
// service or its wire contract.

import type { FavouriteInput, FavouriteResponse } from "@pepta/shared";
import { Types } from "mongoose";
import { FavouriteModel, type FavouriteDocument } from "../models/favourite.model";
import {
  attachMedia,
  detachMedia,
  getMediaViewUrl,
  validateAttachableMedia,
} from "./media.service";

function toResponse(
  doc: FavouriteDocument,
  photoUrl: string | null = null,
): FavouriteResponse {
  return {
    id: doc._id.toString(),
    key: doc.key,
    kind: doc.kind,
    name: doc.name,
    portion: doc.portion ?? "",
    source: doc.source ?? "item",
    ...(doc.photoMediaId
      ? { photoMediaId: doc.photoMediaId.toString() }
      : {}),
    photoUrl,
    ...(doc.protein != null ? { protein: doc.protein } : {}),
    ...(doc.calories != null ? { calories: doc.calories } : {}),
    ...(doc.fiber != null ? { fiber: doc.fiber } : {}),
    ...(doc.ounces != null ? { ounces: doc.ounces } : {}),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

async function photoUrlFor(
  userId: string,
  doc: FavouriteDocument,
): Promise<string | null> {
  if (!doc.photoMediaId) return null;
  return getMediaViewUrl(userId, doc.photoMediaId.toString()).catch(() => null);
}

export async function listFavourites(
  userId: string,
): Promise<{
  favourites: FavouriteResponse[];
  suggestions: FavouriteResponse[];
}> {
  const [mine, seeded] = await Promise.all([
    FavouriteModel.find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec(),
    FavouriteModel.find({ userId: null }).sort({ createdAt: 1 }).exec(),
  ]);
  const sign = async (docs: FavouriteDocument[]) =>
    Promise.all(
      docs.map(async (doc) => toResponse(doc, await photoUrlFor(userId, doc))),
    );
  const [favourites, suggestions] = await Promise.all([sign(mine), sign(seeded)]);
  return { favourites, suggestions };
}

async function rollbackFailedAttachment(input: {
  userId: Types.ObjectId;
  saved: FavouriteDocument;
  existed: boolean;
  previousMediaId?: string;
  newMediaId: string;
}): Promise<void> {
  const filter = {
    _id: input.saved._id,
    userId: input.userId,
    photoMediaId: new Types.ObjectId(input.newMediaId),
  };
  if (!input.existed) {
    await FavouriteModel.findOneAndDelete(filter).exec();
    return;
  }

  await FavouriteModel.findOneAndUpdate(
    filter,
    input.previousMediaId
      ? { $set: { photoMediaId: new Types.ObjectId(input.previousMediaId) } }
      : { $unset: { photoMediaId: 1 } },
  ).exec();
}

export async function saveFavourite(
  userId: string,
  input: FavouriteInput,
): Promise<FavouriteResponse> {
  const ownerId = new Types.ObjectId(userId);
  if (input.photoMediaId) {
    await validateAttachableMedia(userId, input.photoMediaId, "favourite");
  }

  const existing = await FavouriteModel.findOne({
    userId: ownerId,
    key: input.key,
  }).exec();
  const previousMediaId = existing?.photoMediaId?.toString();
  const doc = await FavouriteModel.findOneAndUpdate(
    { userId: ownerId, key: input.key },
    {
      $set: {
        kind: input.kind,
        name: input.name,
        portion: input.portion ?? "",
        source: input.source ?? "item",
        ...(input.photoMediaId
          ? { photoMediaId: new Types.ObjectId(input.photoMediaId) }
          : {}),
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

  if (input.photoMediaId) {
    const link = { kind: "favourite" as const, resourceId: saved._id.toString() };
    try {
      await attachMedia(userId, input.photoMediaId, link);
    } catch (error) {
      await rollbackFailedAttachment({
        userId: ownerId,
        saved,
        existed: Boolean(existing),
        ...(previousMediaId ? { previousMediaId } : {}),
        newMediaId: input.photoMediaId,
      });
      throw error;
    }

    if (previousMediaId && previousMediaId !== input.photoMediaId) {
      await detachMedia(userId, previousMediaId, link);
    }
  }

  return toResponse(saved, await photoUrlFor(userId, saved));
}

/**
 * Idempotent: removing something already gone is not an error.
 *
 * Detach BEFORE delete. The other order has a stranding window: row deleted,
 * then a crash before detach leaves the asset linked to a resource that no
 * longer exists — never unattached, never reaped, object orphaned in S3.
 * This order fails safe: a crash after detach leaves the favourite visible
 * (retryable, and detachMedia is idempotent under that retry).
 */
export async function removeFavourite(userId: string, key: string): Promise<void> {
  const owner = new Types.ObjectId(userId);
  const doc = (await FavouriteModel.findOne({
    userId: owner,
    key,
  }).exec()) as FavouriteDocument | null;
  if (!doc) return;

  if (doc.photoMediaId) {
    await detachMedia(userId, doc.photoMediaId.toString(), {
      kind: "favourite",
      resourceId: doc._id.toString(),
    });
  }

  // Guard on the photo we just detached: if a concurrent save swapped in a
  // new photo between the read and here, deleting the row would strand the
  // NEW photo's link. Missing the delete (a no-op) is the safe side.
  await FavouriteModel.deleteOne({
    _id: doc._id,
    userId: owner,
    ...(doc.photoMediaId
      ? { photoMediaId: doc.photoMediaId }
      : { photoMediaId: { $exists: false } }),
  }).exec();
}
