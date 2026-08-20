// Recipes — the user's own, plus the shared starters.
//
// LIST RETURNS BOTH, separately. The screen shows them under different
// headings with different affordances (yours can be logged and deleted;
// starters are opened and saved as yours), so merging them and asking the
// client to re-split by a flag would be handing it back work the query
// already did.
//
// SAVING A STARTER AS YOURS IS A COPY, not a reference. If it pointed at the
// shared row, correcting a starter later would silently change a recipe
// someone had already adjusted — their saved combination has to be theirs.
//
// STARTERS ARE READ-ONLY to everybody. A delete that matched on id alone would
// let one user remove a row every other user reads.

import type { RecipeInput, RecipeResponse } from "@pepta/shared";
import { Types } from "mongoose";
import { RecipeModel, type RecipeDocument } from "../models/recipe.model";
import { NotFoundError } from "../lib/errors";
import {
  attachMedia,
  detachMedia,
  getMediaViewUrl,
  validateAttachableMedia,
} from "./media.service";

function toResponse(
  doc: RecipeDocument,
  photoUrl: string | null = null,
): RecipeResponse {
  return {
    id: doc._id.toString(),
    name: doc.name,
    isStarter: doc.userId == null,
    ...(doc.photoMediaId
      ? { photoMediaId: doc.photoMediaId.toString() }
      : {}),
    photoUrl,
    ingredients: doc.ingredients.map((i) => ({
      name: i.name,
      amount: i.amount ?? "",
      protein: i.protein,
      calories: i.calories,
      ...(i.fiber != null ? { fiber: i.fiber } : {}),
    })),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

async function photoUrlFor(
  userId: string,
  doc: RecipeDocument,
): Promise<string | null> {
  if (!doc.photoMediaId) return null;
  return getMediaViewUrl(userId, doc.photoMediaId.toString()).catch(() => null);
}

async function signedResponse(
  userId: string,
  doc: RecipeDocument,
): Promise<RecipeResponse> {
  return toResponse(doc, await photoUrlFor(userId, doc));
}

export async function listRecipes(
  userId: string,
): Promise<{ recipes: RecipeResponse[]; starters: RecipeResponse[] }> {
  const [mine, starters] = await Promise.all([
    RecipeModel.find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec(),
    // Oldest first: the seed order is the order the design lists them in, and
    // shuffling a fixed set between visits makes it feel unstable.
    RecipeModel.find({ userId: null }).sort({ createdAt: 1 }).exec(),
  ]);
  const [recipes, signedStarters] = await Promise.all([
    Promise.all(mine.map((doc) => signedResponse(userId, doc))),
    Promise.all(starters.map((doc) => signedResponse(userId, doc))),
  ]);
  return { recipes, starters: signedStarters };
}

export async function getRecipe(
  userId: string,
  id: string,
): Promise<RecipeResponse> {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Recipe not found");
  const doc = await RecipeModel.findOne({
    _id: new Types.ObjectId(id),
    $or: [{ userId: new Types.ObjectId(userId) }, { userId: null }],
  }).exec();
  if (!doc) throw new NotFoundError("Recipe not found");
  return signedResponse(userId, doc);
}

export async function createRecipe(
  userId: string,
  input: RecipeInput,
): Promise<RecipeResponse> {
  if (input.photoMediaId) {
    await validateAttachableMedia(userId, input.photoMediaId, "recipe");
  }
  const doc = await RecipeModel.create({
    userId: new Types.ObjectId(userId),
    name: input.name,
    ingredients: input.ingredients,
    ...(input.photoMediaId
      ? { photoMediaId: new Types.ObjectId(input.photoMediaId) }
      : {}),
  });
  if (input.photoMediaId) {
    try {
      await attachMedia(userId, input.photoMediaId, {
        kind: "recipe",
        resourceId: doc._id.toString(),
      });
    } catch (error) {
      await RecipeModel.findOneAndDelete({
        _id: doc._id,
        userId: new Types.ObjectId(userId),
      }).exec();
      throw error;
    }
  }
  return signedResponse(userId, doc);
}

/**
 * Deletes only a recipe this user owns — starters belong to everybody.
 *
 * Detach BEFORE delete, same reasoning as removeFavourite: the reverse order
 * can strand the photo's asset (row gone, link left) if the process dies in
 * between. Detach-first is retryable because detachMedia is idempotent.
 */
export async function deleteRecipe(userId: string, id: string): Promise<void> {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Recipe not found");
  const owner = new Types.ObjectId(userId);
  const doc = await RecipeModel.findOne({
    _id: new Types.ObjectId(id),
    userId: owner,
  }).exec();
  if (!doc) throw new NotFoundError("Recipe not found");

  if (doc.photoMediaId) {
    await detachMedia(userId, doc.photoMediaId.toString(), {
      kind: "recipe",
      resourceId: doc._id.toString(),
    });
  }

  // Guarded on the detached photo so a concurrent photo swap can't have its
  // fresh link stranded by this delete; the no-op miss is the safe side.
  await RecipeModel.deleteOne({
    _id: doc._id,
    userId: owner,
    ...(doc.photoMediaId
      ? { photoMediaId: doc.photoMediaId }
      : { photoMediaId: { $exists: false } }),
  }).exec();
}
