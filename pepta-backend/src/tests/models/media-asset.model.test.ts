import { describe, expect, it } from "vitest";
import { FavouriteModel } from "../../models/favourite.model";
import { MediaAssetModel } from "../../models/media-asset.model";

describe("MediaAsset model", () => {
  it("requires ownership and lifecycle fields for a direct upload", () => {
    const asset = new MediaAssetModel({ source: "direct_upload" });

    const error = asset.validateSync();

    expect(error?.errors.userId).toBeDefined();
    expect(error?.errors.intent).toBeDefined();
    expect(error?.errors.status).toBeDefined();
    expect(error?.errors.stagingKey).toBeDefined();
    expect(error?.errors.declaredContentType).toBeDefined();
    expect(error?.errors.declaredSizeBytes).toBeDefined();
  });

  it("bounds links so one asset cannot become an unbounded document", () => {
    const links = Array.from({ length: 9 }, (_, index) => ({
      kind: "favourite",
      resourceId: `favourite-${index}`,
      attachedAt: new Date("2026-08-19T12:00:00.000Z"),
    }));
    const asset = new MediaAssetModel({
      userId: "507f1f77bcf86cd799439011",
      source: "direct_upload",
      intent: "favourite_photo",
      status: "ready",
      stagingKey: "pepta/media-staging/user/media.jpg",
      storageKey: "pepta/media/user/media.jpg",
      declaredContentType: "image/jpeg",
      declaredSizeBytes: 1024,
      links,
    });

    expect(asset.validateSync()?.errors.links).toBeDefined();
  });

  it("indexes owner lookup, expiry, and deletion leasing", () => {
    const indexes = MediaAssetModel.schema.indexes().map(([keys]) => keys);

    expect(indexes).toContainEqual({ userId: 1, status: 1 });
    expect(indexes).toContainEqual({ expiresAt: 1, status: 1 });
    expect(indexes).toContainEqual({
      status: 1,
      nextDeleteAttemptAt: 1,
      deleteLeaseUntil: 1,
    });
  });

  it("stores only an owned media reference on favourites", () => {
    expect(FavouriteModel.schema.path("photoMediaId")).toBeDefined();
    expect(FavouriteModel.schema.path("photoS3Key")).toBeUndefined();
  });
});
