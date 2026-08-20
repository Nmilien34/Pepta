import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  attachMedia: vi.fn(),
  confirmMediaUpload: vi.fn(),
  createMediaUploadIntent: vi.fn(),
  detachMedia: vi.fn(),
  discardMedia: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  getMediaReadDetails: vi.fn(),
  photoCreate: vi.fn(),
  photoFind: vi.fn(),
  updateMany: vi.fn(),
  signedUrlExpiresAt: vi.fn(),
}));

vi.mock("../../models", () => ({
  ProgressPhotoModel: {
    create: mocks.photoCreate,
    find: mocks.photoFind,
    findOne: mocks.findOne,
    findOneAndUpdate: mocks.findOneAndUpdate,
    updateMany: mocks.updateMany,
  },
}));

vi.mock("../../services/media.service", () => ({
  attachMedia: mocks.attachMedia,
  confirmMediaUpload: mocks.confirmMediaUpload,
  createMediaUploadIntent: mocks.createMediaUploadIntent,
  detachMedia: mocks.detachMedia,
  discardMedia: mocks.discardMedia,
  getMediaReadDetails: mocks.getMediaReadDetails,
}));

vi.mock("../../services/s3.service", () => ({
  signedUrlExpiresAt: mocks.signedUrlExpiresAt,
}));

import {
  confirmProgressPhoto,
  createProgressPhotoUploadIntent,
  deleteProgressPhoto,
  expirePendingProgressPhotos,
  getProgressPhotoViewUrl,
  listProgressPhotos,
} from "../../services/progress-photo.service";

const USER = "507f1f77bcf86cd799439011";
const PHOTO = "507f1f77bcf86cd799439012";
const MEDIA = "507f1f77bcf86cd799439013";
const NOW = new Date("2026-06-22T00:00:00.000Z");

function photoDocument(value: Record<string, unknown> = {}) {
  return {
    _id: PHOTO,
    userId: USER,
    mediaId: MEDIA,
    captureDate: "2026-06-22",
    contentType: "image/png",
    sizeBytes: 1234,
    kind: "body",
    status: "uploaded",
    createdAt: NOW,
    updatedAt: NOW,
    ...value,
  };
}

describe("progress photo service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    mocks.attachMedia.mockResolvedValue(undefined);
    mocks.confirmMediaUpload.mockResolvedValue({ mediaId: MEDIA, status: "ready" });
    mocks.createMediaUploadIntent.mockResolvedValue({
      mediaId: MEDIA,
      uploadUrl: "https://signed.example/post",
      fields: { key: "private-staging-key", policy: "signed-policy" },
      expiresAt: "2026-06-22T00:10:00.000Z",
    });
    mocks.detachMedia.mockResolvedValue(undefined);
    mocks.discardMedia.mockResolvedValue(undefined);
    mocks.getMediaReadDetails.mockResolvedValue({
      viewUrl: "https://signed.example/view",
      contentType: "image/jpeg",
      sizeBytes: 777,
    });
    mocks.signedUrlExpiresAt.mockReturnValue("2026-06-22T00:10:00.000Z");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a common media intent and stores only the opaque media id", async () => {
    mocks.photoCreate.mockImplementation((payload: Record<string, unknown>) =>
      Promise.resolve(photoDocument({ status: "pending_upload", ...payload })),
    );

    const result = await createProgressPhotoUploadIntent(USER, {
      captureDate: "2026-06-22",
      contentType: "image/png",
      sizeBytes: 1234,
      kind: "body",
    });

    expect(mocks.createMediaUploadIntent).toHaveBeenCalledWith(USER, {
      intent: "progress_photo",
      contentType: "image/png",
      sizeBytes: 1234,
    });
    expect(mocks.photoCreate).toHaveBeenCalledWith({
      userId: USER,
      mediaId: MEDIA,
      captureDate: "2026-06-22",
      contentType: "image/png",
      sizeBytes: 1234,
      kind: "body",
      status: "pending_upload",
      expiresAt: new Date("2026-06-22T01:00:00.000Z"),
    });
    expect(result).toMatchObject({
      uploadUrl: "https://signed.example/post",
      fields: { key: "private-staging-key", policy: "signed-policy" },
      photo: { id: PHOTO, mediaId: MEDIA, status: "pending_upload" },
    });
    expect(result.photo).not.toHaveProperty("s3Key");
  });

  it("discards the created media authority if progress-row creation fails", async () => {
    mocks.photoCreate.mockRejectedValueOnce(new Error("Mongo unavailable"));

    await expect(
      createProgressPhotoUploadIntent(USER, {
        captureDate: "2026-06-22",
        contentType: "image/png",
        sizeBytes: 1234,
        kind: "body",
      }),
    ).rejects.toThrow("Mongo unavailable");

    expect(mocks.discardMedia).toHaveBeenCalledWith(USER, MEDIA);
  });

  it("confirms owned media, attaches it, and transitions only a live pending row", async () => {
    mocks.findOne.mockResolvedValueOnce(
      photoDocument({
        status: "pending_upload",
        expiresAt: new Date("2026-06-22T01:00:00.000Z"),
      }),
    );
    mocks.findOneAndUpdate.mockResolvedValueOnce(
      photoDocument({ contentType: "image/jpeg", sizeBytes: 777 }),
    );

    const result = await confirmProgressPhoto(USER, { photoId: PHOTO });

    expect(mocks.confirmMediaUpload).toHaveBeenCalledWith(USER, { mediaId: MEDIA });
    expect(mocks.attachMedia).toHaveBeenCalledWith(USER, MEDIA, {
      kind: "progress_photo",
      resourceId: PHOTO,
    });
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: PHOTO,
        userId: USER,
        mediaId: expect.anything(),
        status: "pending_upload",
        expiresAt: { $gt: NOW },
      },
      {
        $set: { status: "uploaded", contentType: "image/jpeg", sizeBytes: 777 },
        $unset: { expiresAt: 1 },
      },
      { new: true, runValidators: true },
    );
    expect(result).toMatchObject({
      status: "uploaded",
      contentType: "image/jpeg",
      sizeBytes: 777,
      viewUrl: "https://signed.example/view",
    });
  });

  it("treats repeated confirmation of an uploaded row as idempotent", async () => {
    mocks.findOne.mockResolvedValueOnce(photoDocument());

    const result = await confirmProgressPhoto(USER, { photoId: PHOTO });

    expect(result.status).toBe("uploaded");
    expect(mocks.confirmMediaUpload).not.toHaveBeenCalled();
    expect(mocks.attachMedia).not.toHaveBeenCalled();
  });

  it.each([
    ["cross-owner or missing", null],
    ["deleted", photoDocument({ status: "deleted" })],
    [
      "expired",
      photoDocument({
        status: "pending_upload",
        expiresAt: new Date("2026-06-21T23:59:59.000Z"),
      }),
    ],
  ])("does not resurrect a %s progress row", async (_label, row) => {
    mocks.findOne.mockResolvedValueOnce(row);

    await expect(confirmProgressPhoto(USER, { photoId: PHOTO })).rejects.toThrow(
      /not found/i,
    );
    expect(mocks.confirmMediaUpload).not.toHaveBeenCalled();
  });

  it("detaches media if the pending row changes during confirmation", async () => {
    mocks.findOne
      .mockResolvedValueOnce(
        photoDocument({
          status: "pending_upload",
          expiresAt: new Date("2026-06-22T01:00:00.000Z"),
        }),
      )
      .mockResolvedValueOnce(null);
    mocks.findOneAndUpdate.mockResolvedValueOnce(null);

    await expect(confirmProgressPhoto(USER, { photoId: PHOTO })).rejects.toThrow(
      /not found/i,
    );
    expect(mocks.detachMedia).toHaveBeenCalledWith(USER, MEDIA, {
      kind: "progress_photo",
      resourceId: PHOTO,
    });
  });

  it("lists and views uploaded rows with signed, measured media only", async () => {
    mocks.photoFind.mockReturnValue({
      sort: vi.fn().mockResolvedValue([photoDocument()]),
    });
    mocks.findOne.mockResolvedValueOnce(photoDocument());

    const listed = await listProgressPhotos(USER);
    const viewed = await getProgressPhotoViewUrl(USER, PHOTO);

    expect(mocks.photoFind).toHaveBeenCalledWith({
      userId: USER,
      status: "uploaded",
    });
    expect(mocks.getMediaReadDetails).toHaveBeenCalledWith(USER, MEDIA);
    expect(listed[0]).toMatchObject({
      mediaId: MEDIA,
      contentType: "image/jpeg",
      sizeBytes: 777,
      viewUrl: "https://signed.example/view",
    });
    expect(listed[0]).not.toHaveProperty("s3Key");
    expect(viewed).toMatchObject({
      photo: { id: PHOTO, viewUrl: "https://signed.example/view" },
      viewUrl: "https://signed.example/view",
      expiresAt: "2026-06-22T00:10:00.000Z",
    });
  });

  it("rolls an uploaded row back when durable media detachment fails", async () => {
    mocks.findOneAndUpdate
      .mockResolvedValueOnce(photoDocument({ status: "uploaded" }))
      .mockResolvedValueOnce(photoDocument({ status: "uploaded" }));
    mocks.detachMedia.mockRejectedValueOnce(new Error("Mongo unavailable"));

    await expect(deleteProgressPhoto(USER, PHOTO)).rejects.toThrow(
      "Mongo unavailable",
    );

    expect(mocks.findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      { _id: PHOTO, userId: USER, mediaId: expect.anything(), status: "deleted" },
      { $set: { status: "uploaded" } },
      { new: true, runValidators: true },
    );
  });

  it("expires pending rows without deleting S3 synchronously", async () => {
    mocks.updateMany.mockResolvedValue({ modifiedCount: 3 });

    await expect(expirePendingProgressPhotos(NOW)).resolves.toBe(3);

    expect(mocks.updateMany).toHaveBeenCalledWith(
      { status: "pending_upload", expiresAt: { $lte: NOW } },
      { $set: { status: "deleted" }, $unset: { expiresAt: 1 } },
    );
    expect(mocks.detachMedia).not.toHaveBeenCalled();
    expect(mocks.discardMedia).not.toHaveBeenCalled();
  });
});
