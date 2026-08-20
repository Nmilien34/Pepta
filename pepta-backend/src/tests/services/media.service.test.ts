import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  aggregate: vi.fn(),
  countDocuments: vi.fn(),
  create: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateMany: vi.fn(),
  createPresignedGetUrl: vi.fn(),
  createPresignedPostUpload: vi.fn(),
  deleteS3Object: vi.fn(),
  getS3ObjectBytes: vi.fn(),
  headS3Object: vi.fn(),
  putS3Object: vi.fn(),
  normalizeImage: vi.fn(),
}));

vi.mock("../../models/media-asset.model", () => ({
  MediaAssetModel: {
    aggregate: mocks.aggregate,
    countDocuments: mocks.countDocuments,
    create: mocks.create,
    findOne: mocks.findOne,
    findOneAndUpdate: mocks.findOneAndUpdate,
    updateMany: mocks.updateMany,
  },
}));

vi.mock("../../services/s3.service", () => ({
  createPresignedGetUrl: mocks.createPresignedGetUrl,
  createPresignedPostUpload: mocks.createPresignedPostUpload,
  deleteS3Object: mocks.deleteS3Object,
  getS3ObjectBytes: mocks.getS3ObjectBytes,
  headS3Object: mocks.headS3Object,
  putS3Object: mocks.putS3Object,
  signedUrlExpiresAt: () => "2026-08-19T12:10:00.000Z",
}));

vi.mock("../../services/image-normalization.service", () => ({
  normalizeImage: mocks.normalizeImage,
}));

import {
  attachMedia,
  confirmMediaUpload,
  createMediaUploadIntent,
  detachMedia,
  discardMedia,
  getMediaViewUrl,
  queueAllUserMediaForDeletion,
  validateAttachableMedia,
} from "../../services/media.service";

const USER = "507f1f77bcf86cd799439011";
const OTHER_USER = "507f1f77bcf86cd799439012";
const MEDIA = "507f1f77bcf86cd799439013";
const NOW = new Date("2026-08-19T12:00:00.000Z");
const UPLOAD_BYTES = new Uint8Array(2048);

function asset(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => MEDIA },
    userId: USER,
    source: "direct_upload",
    intent: "favourite_photo",
    status: "pending_upload",
    stagingKey: `pepta/media-staging/${USER}/${MEDIA}.png`,
    declaredContentType: "image/png",
    declaredSizeBytes: 2048,
    links: [],
    deleteAttemptCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  mocks.countDocuments.mockResolvedValue(0);
  mocks.aggregate.mockResolvedValue([]);
  mocks.create.mockImplementation(async (input: Record<string, unknown>) => ({
    ...input,
    _id: { toString: () => String(input._id) },
  }));
  mocks.findOne.mockResolvedValue(null);
  mocks.findOneAndUpdate.mockResolvedValue(null);
  mocks.updateMany.mockResolvedValue({ modifiedCount: 0 });
  mocks.createPresignedPostUpload.mockResolvedValue({
    uploadUrl: "https://s3.example/upload",
    fields: { key: "generated-by-server" },
  });
  mocks.headS3Object.mockResolvedValue({
    contentType: "image/png",
    contentLength: 2048,
  });
  mocks.getS3ObjectBytes.mockResolvedValue(UPLOAD_BYTES);
  mocks.normalizeImage.mockResolvedValue({
    bytes: Uint8Array.of(4, 5, 6),
    contentType: "image/jpeg",
    width: 800,
    height: 600,
  });
  mocks.putS3Object.mockResolvedValue(undefined);
  mocks.deleteS3Object.mockResolvedValue(undefined);
  mocks.createPresignedGetUrl.mockResolvedValue("https://s3.example/view");
});

describe("media upload intent", () => {
  it("creates a favourite upload under an owner-scoped generated staging key", async () => {
    const result = await createMediaUploadIntent(USER, {
      intent: "favourite_photo",
      contentType: "image/png",
      sizeBytes: 2048,
    });

    expect(result.mediaId).toMatch(/^[a-f0-9]{24}$/);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: expect.anything(),
        userId: expect.anything(),
        source: "direct_upload",
        intent: "favourite_photo",
        status: "pending_upload",
        declaredContentType: "image/png",
        declaredSizeBytes: 2048,
        expiresAt: new Date("2026-08-19T13:00:00.000Z"),
      }),
    );
    const key = mocks.create.mock.calls[0]![0].stagingKey as string;
    expect(key).toBe(`pepta/media-staging/${USER}/${result.mediaId}.png`);
    expect(mocks.createPresignedPostUpload).toHaveBeenCalledWith({
      key,
      contentType: "image/png",
      maxBytes: 5 * 1024 * 1024,
    });
    expect(result).not.toHaveProperty("key");
  });

  it("rejects a favourite image larger than five MiB before creating a row", async () => {
    await expect(
      createMediaUploadIntent(USER, {
        intent: "favourite_photo",
        contentType: "image/jpeg",
        sizeBytes: 5 * 1024 * 1024 + 1,
      }),
    ).rejects.toThrow(/too large/i);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("enforces the per-account pending upload count", async () => {
    mocks.countDocuments.mockResolvedValue(20);

    await expect(
      createMediaUploadIntent(USER, {
        intent: "favourite_photo",
        contentType: "image/jpeg",
        sizeBytes: 1024,
      }),
    ).rejects.toThrow(/too many pending/i);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("counts in-flight processing rows even after their upload expiry is cleared", async () => {
    await createMediaUploadIntent(USER, {
      intent: "favourite_photo",
      contentType: "image/jpeg",
      sizeBytes: 1024,
    });

    expect(mocks.countDocuments).toHaveBeenCalledWith({
      userId: expect.anything(),
      $or: [
        { status: "pending_upload", expiresAt: { $gt: NOW } },
        { status: "processing" },
      ],
    });
  });
});

describe("media confirmation", () => {
  it("does not confirm another user's media or touch S3", async () => {
    mocks.findOne.mockResolvedValue(null);
    mocks.findOneAndUpdate.mockResolvedValue(null);

    await expect(confirmMediaUpload(OTHER_USER, { mediaId: MEDIA })).rejects.toThrow(
      /not found/i,
    );
    expect(mocks.headS3Object).not.toHaveBeenCalled();
  });

  it("returns an already-ready owned upload idempotently", async () => {
    mocks.findOne.mockResolvedValue(asset({ status: "ready" }));

    await expect(confirmMediaUpload(USER, { mediaId: MEDIA })).resolves.toEqual({
      mediaId: MEDIA,
      status: "ready",
    });
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.headS3Object).not.toHaveBeenCalled();
  });

  it("measures, normalizes, and marks the canonical object ready", async () => {
    mocks.findOneAndUpdate
      .mockResolvedValueOnce(asset({ status: "processing" }))
      .mockResolvedValueOnce(
        asset({
          status: "ready",
          storageKey: `pepta/media/${USER}/${MEDIA}.jpg`,
          contentType: "image/jpeg",
          byteSize: 3,
          width: 800,
          height: 600,
        }),
      );

    await expect(confirmMediaUpload(USER, { mediaId: MEDIA })).resolves.toEqual({
      mediaId: MEDIA,
      status: "ready",
    });
    expect(mocks.normalizeImage).toHaveBeenCalledWith(UPLOAD_BYTES, {
      maxBytes: 5 * 1024 * 1024,
      maxEdge: 1600,
      maxPixels: 24_000_000,
    });
    expect(mocks.putS3Object).toHaveBeenCalledWith({
      key: `pepta/media/${USER}/${MEDIA}.jpg`,
      body: Uint8Array.of(4, 5, 6),
      contentType: "image/jpeg",
    });
    expect(mocks.deleteS3Object).toHaveBeenCalledWith(
      `pepta/media-staging/${USER}/${MEDIA}.png`,
    );
  });

  it("rejects declared and measured size mismatches and queues cleanup", async () => {
    mocks.findOneAndUpdate
      .mockResolvedValueOnce(asset({ status: "processing" }))
      .mockResolvedValueOnce(asset({ status: "deletion_pending" }));
    mocks.headS3Object.mockResolvedValue({
      contentType: "image/png",
      contentLength: 4096,
    });

    await expect(confirmMediaUpload(USER, { mediaId: MEDIA })).rejects.toThrow(
      /does not match/i,
    );
    expect(mocks.getS3ObjectBytes).not.toHaveBeenCalled();
    expect(mocks.findOneAndUpdate.mock.calls.at(-1)?.[1]).toMatchObject({
      $set: expect.objectContaining({ status: "deletion_pending" }),
    });
  });
});

describe("media ownership and links", () => {
  it("rejects cross-owner or wrong-intent media with the same not-found boundary", async () => {
    mocks.findOne.mockResolvedValue(null);

    await expect(validateAttachableMedia(USER, MEDIA, "favourite")).rejects.toThrow(
      /not found/i,
    );
  });

  it("attaches an owned ready favourite photo and clears abandonment expiry", async () => {
    mocks.findOne.mockResolvedValue(asset({ status: "ready" }));
    mocks.findOneAndUpdate.mockResolvedValue(
      asset({
        status: "ready",
        links: [{ kind: "favourite", resourceId: "fav-1", attachedAt: NOW }],
      }),
    );

    await attachMedia(USER, MEDIA, { kind: "favourite", resourceId: "fav-1" });

    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: expect.anything(),
        userId: expect.anything(),
        status: "ready",
        links: { $not: { $elemMatch: { kind: "favourite", resourceId: "fav-1" } } },
      }),
      {
        $push: {
          links: { kind: "favourite", resourceId: "fav-1", attachedAt: NOW },
        },
        $unset: { expiresAt: 1 },
      },
      { new: true, runValidators: true },
    );
  });

  it("queues the asset when its last product link is detached", async () => {
    mocks.findOneAndUpdate
      .mockResolvedValueOnce(asset({ status: "ready", links: [] }))
      .mockResolvedValueOnce(asset({ status: "deletion_pending", links: [] }));

    await detachMedia(USER, MEDIA, { kind: "favourite", resourceId: "fav-1" });

    expect(mocks.findOneAndUpdate.mock.calls[1]?.[0]).toMatchObject({
      status: "ready",
      links: { $size: 0 },
    });
    expect(mocks.findOneAndUpdate.mock.calls[1]?.[1]).toMatchObject({
      $set: { status: "deletion_pending", nextDeleteAttemptAt: NOW },
    });
  });

  it("discards only an owned unlinked media id", async () => {
    mocks.findOneAndUpdate.mockResolvedValue(asset({ status: "deletion_pending" }));

    await discardMedia(USER, MEDIA);

    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: expect.anything(),
        userId: expect.anything(),
        links: { $size: 0 },
      }),
      expect.objectContaining({
        $set: { status: "deletion_pending", nextDeleteAttemptAt: NOW },
      }),
      { new: true },
    );
  });

  it("signs only an owned ready canonical object", async () => {
    mocks.findOne.mockResolvedValue(
      asset({ status: "ready", storageKey: `pepta/media/${USER}/${MEDIA}.jpg` }),
    );

    await expect(getMediaViewUrl(USER, MEDIA)).resolves.toBe("https://s3.example/view");
    expect(mocks.createPresignedGetUrl).toHaveBeenCalledWith({
      key: `pepta/media/${USER}/${MEDIA}.jpg`,
    });
  });

  it("queues every owned asset durably for account deletion", async () => {
    await queueAllUserMediaForDeletion(USER);

    expect(mocks.updateMany).toHaveBeenCalledWith(
      { userId: expect.anything(), status: { $ne: "deleted" } },
      {
        $set: {
          status: "deletion_pending",
          links: [],
          nextDeleteAttemptAt: NOW,
        },
        $unset: { expiresAt: 1, deleteLeaseUntil: 1 },
      },
    );
  });
});
