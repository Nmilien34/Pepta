import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPresignedGetUrl: vi.fn(),
  createPresignedPutUrl: vi.fn(),
  deleteS3Object: vi.fn(),
  signedUrlExpiresAt: vi.fn(),
  userFindById: vi.fn(),
}));

vi.mock("../../models", () => ({
  UserModel: {
    findById: mocks.userFindById,
  },
}));

vi.mock("../../services/s3.service", () => ({
  createPresignedGetUrl: mocks.createPresignedGetUrl,
  createPresignedPutUrl: mocks.createPresignedPutUrl,
  deleteS3Object: mocks.deleteS3Object,
  signedUrlExpiresAt: mocks.signedUrlExpiresAt,
}));

import { ValidationError } from "../../lib/errors";
import {
  confirmAvatarUpload,
  createAvatarUploadIntent,
  getAvatarViewUrl,
} from "../../services/avatar.service";

function userDocument(value: Record<string, unknown>) {
  const user = {
    _id: value.id,
    id: value.id,
    email: "nick@pepta.app",
    emailVerified: true,
    avatarKey: value.avatarKey,
    authProviders: [],
    entitlement: { status: "free", expiresAt: null, willRenew: false },
    onboardingComplete: true,
    createdAt: new Date("2026-06-21T00:00:00.000Z"),
    updatedAt: new Date("2026-06-21T00:00:00.000Z"),
    save: vi.fn(async () => user),
    toObject: () => ({
      id: value.id,
      email: "nick@pepta.app",
      emailVerified: true,
      avatarKey: user.avatarKey,
      authProviders: [],
      entitlement: { status: "free", expiresAt: null, willRenew: false },
      onboardingComplete: true,
      createdAt: "2026-06-21T00:00:00.000Z",
      updatedAt: "2026-06-21T00:00:00.000Z",
    }),
  };
  return user;
}

describe("avatar service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createPresignedGetUrl.mockResolvedValue(
      "https://signed.example/view",
    );
    mocks.createPresignedPutUrl.mockResolvedValue("https://signed.example/put");
    mocks.deleteS3Object.mockResolvedValue(undefined);
    mocks.signedUrlExpiresAt.mockReturnValue("2026-06-21T00:10:00.000Z");
  });

  it("creates a user-owned avatar upload intent", async () => {
    const result = await createAvatarUploadIntent("user-1", {
      contentType: "image/png",
      sizeBytes: 12345,
    });

    expect(mocks.createPresignedPutUrl).toHaveBeenCalledWith({
      key: expect.stringMatching(/^pepta\/avatars\/user-1\/.+\.png$/),
      contentType: "image/png",
    });
    expect(result).toEqual({
      key: expect.stringMatching(/^pepta\/avatars\/user-1\/.+\.png$/),
      uploadUrl: "https://signed.example/put",
      expiresAt: "2026-06-21T00:10:00.000Z",
    });
  });

  it("persists a confirmed avatar and removes the previous uploaded avatar", async () => {
    const user = userDocument({
      id: "user-1",
      avatarKey: "pepta/avatars/user-1/old.jpg",
    });
    mocks.userFindById.mockResolvedValue(user);

    const result = await confirmAvatarUpload("user-1", {
      key: "pepta/avatars/user-1/new.png",
    });

    expect(user.avatarKey).toBe("pepta/avatars/user-1/new.png");
    expect(user.save).toHaveBeenCalledTimes(1);
    expect(mocks.deleteS3Object).toHaveBeenCalledWith(
      "pepta/avatars/user-1/old.jpg",
    );
    expect(result.hasAvatar).toBe(true);
  });

  it("rejects confirmed avatar keys outside the current user's prefix", async () => {
    await expect(
      confirmAvatarUpload("user-1", {
        key: "pepta/avatars/user-2/avatar.png",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(mocks.userFindById).not.toHaveBeenCalled();
  });

  it("returns a fresh view URL only when the user has an uploaded avatar", async () => {
    mocks.userFindById
      .mockResolvedValueOnce(
        userDocument({ id: "user-1", avatarKey: "pepta/avatars/user-1/a.jpg" }),
      )
      .mockResolvedValueOnce(userDocument({ id: "user-1" }));

    await expect(getAvatarViewUrl("user-1")).resolves.toEqual({
      viewUrl: "https://signed.example/view",
      expiresAt: "2026-06-21T00:10:00.000Z",
    });
    await expect(getAvatarViewUrl("user-1")).resolves.toEqual({
      viewUrl: null,
      expiresAt: null,
    });
  });
});
