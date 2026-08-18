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

function toResponse(doc: RecipeDocument): RecipeResponse {
  return {
    id: doc._id.toString(),
    name: doc.name,
    isStarter: doc.userId == null,
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
  return { recipes: mine.map(toResponse), starters: starters.map(toResponse) };
}

export async function createRecipe(
  userId: string,
  input: RecipeInput,
): Promise<RecipeResponse> {
  const doc = await RecipeModel.create({
    userId: new Types.ObjectId(userId),
    name: input.name,
    ingredients: input.ingredients,
  });
  return toResponse(doc);
}

/** Deletes only a recipe this user owns — starters belong to everybody. */
export async function deleteRecipe(userId: string, id: string): Promise<void> {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Recipe not found");
  const result = await RecipeModel.deleteOne({
    _id: new Types.ObjectId(id),
    userId: new Types.ObjectId(userId),
  }).exec();
  if (result.deletedCount === 0) throw new NotFoundError("Recipe not found");
}
