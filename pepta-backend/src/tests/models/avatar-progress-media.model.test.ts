import { describe, expect, it } from "vitest";
import { ProgressPhotoModel } from "../../models/cache.model";
import { UserModel } from "../../models/user.model";

describe("avatar and progress media references", () => {
  it("stores only the active avatar as a MediaAsset reference", () => {
    expect(UserModel.schema.path("avatarMediaId")?.options).toMatchObject({
      ref: "MediaAsset",
    });
    expect(UserModel.schema.path("providerAvatarFingerprint")).toBeDefined();
    expect(UserModel.schema.path("avatarKey")).toBeUndefined();
    expect(UserModel.schema.path("avatarUrl")).toBeUndefined();
  });

  it("stores progress image ownership in MediaAsset with pending expiry", () => {
    expect(ProgressPhotoModel.schema.path("mediaId")?.options).toMatchObject({
      ref: "MediaAsset",
      required: true,
      unique: true,
    });
    expect(ProgressPhotoModel.schema.path("expiresAt")).toBeDefined();
    expect(ProgressPhotoModel.schema.path("s3Key")).toBeUndefined();
    expect(ProgressPhotoModel.schema.indexes().map(([keys]) => keys)).toContainEqual({
      status: 1,
      expiresAt: 1,
    });
  });
});
