import { describe, expect, it } from "vitest";
import { MealScanModel } from "../../models/cache.model";
import { MealLogModel } from "../../models/log.model";
import { RecipeModel } from "../../models/recipe.model";

describe("meal and recipe media references", () => {
  it("stores the required scan photo as a unique MediaAsset reference", () => {
    const path = MealScanModel.schema.path("photoMediaId");

    expect(path).toBeDefined();
    expect(path?.options).toMatchObject({
      ref: "MediaAsset",
      required: true,
      unique: true,
    });
    expect(MealScanModel.schema.path("photoS3Key")).toBeUndefined();
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
