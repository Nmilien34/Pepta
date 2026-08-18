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
import { Types } from "mongoose";
import { FavouriteModel, type FavouriteDocument } from "../models/favourite.model";

function toResponse(doc: FavouriteDocument): FavouriteResponse {
  return {
    id: doc._id.toString(),
    key: doc.key,
    kind: doc.kind,
    name: doc.name,
    portion: doc.portion ?? "",
    source: doc.source ?? "item",
    ...(doc.protein != null ? { protein: doc.protein } : {}),
    ...(doc.calories != null ? { calories: doc.calories } : {}),
    ...(doc.fiber != null ? { fiber: doc.fiber } : {}),
    ...(doc.ounces != null ? { ounces: doc.ounces } : {}),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function listFavourites(userId: string): Promise<FavouriteResponse[]> {
  const docs = await FavouriteModel.find({ userId: new Types.ObjectId(userId) })
    .sort({ createdAt: -1 })
    .exec();
  return docs.map(toResponse);
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
  return toResponse(doc as FavouriteDocument);
}

/** Idempotent: removing something already gone is not an error. */
export async function removeFavourite(userId: string, key: string): Promise<void> {
  await FavouriteModel.deleteOne({
    userId: new Types.ObjectId(userId),
    key,
  }).exec();
}
