import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPresignedGetUrl: vi.fn(),
  createPresignedPutUrl: vi.fn(),
  deleteS3Object: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  photoCreate: vi.fn(),
  photoFind: vi.fn(),
  signedUrlExpiresAt: vi.fn(),
}));

vi.mock("../../models", () => ({
  ProgressPhotoModel: {
    create: mocks.photoCreate,
    find: mocks.photoFind,
    findOne: mocks.findOne,
    findOneAndUpdate: mocks.findOneAndUpdate,
  },
}));

vi.mock("../../services/s3.service", () => ({
  createPresignedGetUrl: mocks.createPresignedGetUrl,
  createPresignedPutUrl: mocks.createPresignedPutUrl,
  deleteS3Object: mocks.deleteS3Object,
  signedUrlExpiresAt: mocks.signedUrlExpiresAt,
}));

import {
  confirmProgressPhoto,
  createProgressPhotoUploadIntent,
  deleteProgressPhoto,
  getProgressPhotoViewUrl,
  listProgressPhotos,
} from "../../services/progress-photo.service";

function photoDocument(value: Record<string, unknown>) {
  return {
    _id: value.id,
    userId: "user-1",
    captureDate: "2026-06-22",
    contentType: "image/png",
    sizeBytes: 1234,
    kind: "body",
    s3Key: "pepta/progress-photos/user-1/photo.png",
    status: "uploaded",
    createdAt: new Date("2026-06-22T00:00:00.000Z"),
    updatedAt: new Date("2026-06-22T00:00:00.000Z"),
    ...value,
  };
}

describe("progress photo service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createPresignedGetUrl.mockResolvedValue(
      "https://signed.example/view",
    );
    mocks.createPresignedPutUrl.mockResolvedValue("https://signed.example/put");
    mocks.deleteS3Object.mockResolvedValue(undefined);
    mocks.signedUrlExpiresAt.mockReturnValue("2026-06-22T00:10:00.000Z");
  });

  it("creates an upload intent with a presigned PUT URL and Pepta object key", async () => {
    mocks.photoCreate.mockImplementation((payload: Record<string, unknown>) =>
      Promise.resolve(photoDocument({ id: "photo-1", ...payload })),
    );

    const result = await createProgressPhotoUploadIntent("user-1", {
      captureDate: "2026-06-22",
      contentType: "image/png",
      kind: "body",
    });

    expect(mocks.createPresignedPutUrl).toHaveBeenCalledWith({
      key: expect.stringMatching(/^pepta\/progress-photos\/user-1\/.+\.png$/),
      contentType: "image/png",
    });
    expect(mocks.photoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        status: "pending_upload",
        s3Key: expect.stringMatching(
          /^pepta\/progress-photos\/user-1\/.+\.png$/,
        ),
      }),
    );
    expect(result.uploadUrl).toBe("https://signed.example/put");
    expect(result.expiresAt).toBe("2026-06-22T00:10:00.000Z");
  });

  it("lists uploaded photos with presigned GET URLs only", async () => {
    mocks.photoFind.mockReturnValue({
      sort: vi.fn().mockResolvedValue([photoDocument({ id: "photo-1" })]),
    });

    const result = await listProgressPhotos("user-1");

    expect(mocks.photoFind).toHaveBeenCalledWith({
      userId: "user-1",
      status: "uploaded",
    });
    expect(mocks.createPresignedGetUrl).toHaveBeenCalledWith({
      key: "pepta/progress-photos/user-1/photo.png",
    });
    expect(result[0]?.viewUrl).toBe("https://signed.example/view");
  });

  it("returns a fresh view URL for one uploaded photo", async () => {
    mocks.findOne.mockResolvedValue(photoDocument({ id: "photo-1" }));

    const result = await getProgressPhotoViewUrl("user-1", "photo-1");

    expect(mocks.findOne).toHaveBeenCalledWith({
      _id: "photo-1",
      userId: "user-1",
      status: "uploaded",
    });
    expect(result.viewUrl).toBe("https://signed.example/view");
    expect(result.expiresAt).toBe("2026-06-22T00:10:00.000Z");
  });

  it("confirms and deletes uploaded progress photos through S3", async () => {
    mocks.findOneAndUpdate
      .mockResolvedValueOnce(
        photoDocument({ id: "photo-1", status: "uploaded" }),
      )
      .mockResolvedValueOnce(
        photoDocument({ id: "photo-1", status: "deleted" }),
      );

    const confirmed = await confirmProgressPhoto("user-1", {
      photoId: "photo-1",
      sizeBytes: 4321,
    });
    await deleteProgressPhoto("user-1", "photo-1");

    expect(confirmed.status).toBe("uploaded");
    expect(mocks.findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      { _id: "photo-1", userId: "user-1" },
      { $set: { status: "deleted" } },
      { new: true },
    );
    expect(mocks.deleteS3Object).toHaveBeenCalledWith(
      "pepta/progress-photos/user-1/photo.png",
    );
  });
});
