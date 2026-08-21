import { describe, expect, it } from "vitest";
import { MealScanModel } from "../../models/cache.model";
import { MealLogModel } from "../../models/log.model";
import { RecipeModel } from "../../models/recipe.model";

describe("meal and recipe media references", () => {
  it("stores the required scan photo as a MediaAsset reference", () => {
    const path = MealScanModel.schema.path("photoMediaId");

    expect(path).toBeDefined();
    expect(path?.options).toMatchObject({
      ref: "MediaAsset",
      required: true,
    });
    expect(MealScanModel.schema.path("photoS3Key")).toBeUndefined();
  });

  it("makes the scan photo unique with a PARTIAL index, so legacy scans cannot block it", () => {
    // This shipped as `unique: true` on the path, which builds a plain unique
    // index over EVERY document. `required` only governs new writes, and the
    // nine mealscans that predate the media pipeline carry no such field — so
    // Mongo saw a run of duplicate nulls and the index failed to build on every
    // boot (E11000, seen in production 2026-08-21). Uniqueness silently did not
    // exist.
    //
    // $type: "objectId" is deliberately stricter than `sparse: true`: sparse
    // still indexes an explicit null, so a future bug writing null would bring
    // the same failure back.
    const index = MealScanModel.schema.indexes().find(
      ([fields]) => Object.keys(fields).length === 1 && "photoMediaId" in fields,
    );

    expect(index).toBeDefined();
    expect(index?.[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { photoMediaId: { $type: "objectId" } },
    });
  });

  it("stores only an optional MediaAsset reference on meal logs", () => {
    expect(MealLogModel.schema.path("photoMediaId")?.options).toMatchObject({
      ref: "MediaAsset",
    });
    expect(MealLogModel.schema.path("photoS3Key")).toBeUndefined();
  });

  it("stores only an optional MediaAsset reference on recipes", () => {
    expect(RecipeModel.schema.path("photoMediaId")?.options).toMatchObject({
      ref: "MediaAsset",
    });
    expect(RecipeModel.schema.path("photoS3Key")).toBeUndefined();
  });
});
