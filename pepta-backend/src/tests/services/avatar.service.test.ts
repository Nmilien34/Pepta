import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  attachMedia: vi.fn(),
  detachMedia: vi.fn(),
  getMediaViewUrl: vi.fn(),
  signedUrlExpiresAt: vi.fn(),
  userFindById: vi.fn(),
  userFindOneAndUpdate: vi.fn(),
  validateAttachableMedia: vi.fn(),
}));

vi.mock("../../models", () => ({
  UserModel: {
    findById: mocks.userFindById,
    findOneAndUpdate: mocks.userFindOneAndUpdate,
  },
}));

vi.mock("../../services/media.service", () => ({
  attachMedia: mocks.attachMedia,
  detachMedia: mocks.detachMedia,
  getMediaViewUrl: mocks.getMediaViewUrl,
  validateAttachableMedia: mocks.validateAttachableMedia,
}));

vi.mock("../../services/s3.service", () => ({
  signedUrlExpiresAt: mocks.signedUrlExpiresAt,
}));

import {
  getAvatarViewUrl,
  setAvatarMedia,
} from "../../services/avatar.service";

const USER = "507f1f77bcf86cd799439011";
const MEDIA = "507f1f77bcf86cd799439012";
const OLD_MEDIA = "507f1f77bcf86cd799439013";

function userDocument(value: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => USER },
    avatarMediaId: undefined,
    ...value,
  };
}

describe("avatar service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.attachMedia.mockResolvedValue(undefined);
    mocks.detachMedia.mockResolvedValue(undefined);
    mocks.getMediaViewUrl.mockResolvedValue("https://signed.example/view");
    mocks.signedUrlExpiresAt.mockReturnValue("2026-06-21T00:10:00.000Z");
    mocks.validateAttachableMedia.mockResolvedValue({ _id: MEDIA });
  });

  it("activates an owned ready avatar before detaching the previous media", async () => {
    mocks.userFindById.mockResolvedValue(
      userDocument({ avatarMediaId: { toString: () => OLD_MEDIA } }),
    );
    mocks.userFindOneAndUpdate.mockResolvedValue(
      userDocument({ avatarMediaId: { toString: () => MEDIA } }),
    );

    const result = await setAvatarMedia(USER, MEDIA);

    expect(mocks.validateAttachableMedia).toHaveBeenCalledWith(USER, MEDIA, "avatar");
    expect(mocks.attachMedia).toHaveBeenCalledWith(USER, MEDIA, {
      kind: "avatar",
      resourceId: USER,
    });
    expect(mocks.userFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: expect.anything(), avatarMediaId: expect.anything() }),
      {
        $set: { avatarMediaId: expect.anything() },
        $unset: { providerAvatarFingerprint: 1 },
      },
      { new: true, runValidators: true },
    );
    expect(mocks.detachMedia).toHaveBeenCalledWith(USER, OLD_MEDIA, {
      kind: "avatar",
      resourceId: USER,
    });
    expect(mocks.attachMedia.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.detachMedia.mock.invocationCallOrder[0]!,
    );
    expect(result.avatarMediaId?.toString()).toBe(MEDIA);
  });

  it("detaches the new media when the conditional user update loses a race", async () => {
    mocks.userFindById.mockResolvedValue(userDocument());
    mocks.userFindOneAndUpdate.mockResolvedValue(null);

    await expect(setAvatarMedia(USER, MEDIA)).rejects.toThrow(/could not be updated/i);

    expect(mocks.detachMedia).toHaveBeenCalledWith(USER, MEDIA, {
      kind: "avatar",
      resourceId: USER,
    });
  });

  it("returns a fresh signed view URL only for the active media id", async () => {
    mocks.userFindById
      .mockResolvedValueOnce(
        userDocument({ avatarMediaId: { toString: () => MEDIA } }),
      )
      .mockResolvedValueOnce(userDocument());

    await expect(getAvatarViewUrl(USER)).resolves.toEqual({
      viewUrl: "https://signed.example/view",
      expiresAt: "2026-06-21T00:10:00.000Z",
    });
    expect(mocks.getMediaViewUrl).toHaveBeenCalledWith(USER, MEDIA);
    await expect(getAvatarViewUrl(USER)).resolves.toEqual({
      viewUrl: null,
      expiresAt: null,
    });
  });
});
