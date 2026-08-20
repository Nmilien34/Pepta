import { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  attachMedia: vi.fn(),
  detachMedia: vi.fn(),
  mediaFindOne: vi.fn(),
  persistImportedAvatarMedia: vi.fn(),
  userFindOneAndUpdate: vi.fn(),
}));

vi.mock("../../models", () => ({
  MediaAssetModel: { findOne: mocks.mediaFindOne },
  UserModel: { findOneAndUpdate: mocks.userFindOneAndUpdate },
}));

vi.mock("../../services/media.service", () => ({
  attachMedia: mocks.attachMedia,
  detachMedia: mocks.detachMedia,
  persistImportedAvatarMedia: mocks.persistImportedAvatarMedia,
}));

import { refreshGoogleAvatar } from "../../services/provider-avatar.service";

const USER = "507f1f77bcf86cd799439011";
const OLD_MEDIA = "507f1f77bcf86cd799439012";
const NEW_MEDIA = "507f1f77bcf86cd799439013";
const PICTURE = "https://lh3.googleusercontent.com/a/provider-photo";

function userDocument(value: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(USER),
    avatarMediaId: undefined,
    providerAvatarFingerprint: undefined,
    ...value,
  } as never;
}

function response(input: {
  status?: number;
  headers?: Record<string, string>;
  chunks?: Uint8Array[];
}) {
  const chunks = [...(input.chunks ?? [])];
  return {
    status: input.status ?? 200,
    ok: (input.status ?? 200) >= 200 && (input.status ?? 200) < 300,
    headers: new Headers(input.headers),
    body: {
      getReader: () => ({
        read: vi.fn(async () => {
          const value = chunks.shift();
          return value ? { done: false, value } : { done: true, value: undefined };
        }),
        cancel: vi.fn(),
      }),
    },
  } as unknown as Response;
}

describe("provider avatar service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.attachMedia.mockResolvedValue(undefined);
    mocks.detachMedia.mockResolvedValue(undefined);
    mocks.mediaFindOne.mockResolvedValue({ source: "provider_import" });
    mocks.persistImportedAvatarMedia.mockResolvedValue({
      mediaId: NEW_MEDIA,
      status: "ready",
    });
    mocks.userFindOneAndUpdate.mockResolvedValue({ _id: USER });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    "http://lh3.googleusercontent.com/a/photo",
    "https://evil.example/a/photo",
    "https://googleusercontent.com.evil.example/a/photo",
    "https://user:password@lh3.googleusercontent.com/a/photo",
    "https://lh3.googleusercontent.com:444/a/photo",
    "https://lh3.googleusercontent.com/a/photo#fragment",
  ])("rejects an untrusted picture claim before fetching: %s", async (pictureUrl) => {
    const fetchImpl = vi.fn();

    await expect(
      refreshGoogleAvatar(userDocument(), pictureUrl, { fetchImpl }),
    ).rejects.toThrow(/trusted Google image URL/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("revalidates redirects and replaces only an existing provider avatar", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          status: 302,
          headers: { location: "/a/final-photo" },
        }),
      )
      .mockResolvedValueOnce(
        response({
          headers: {
            "content-type": "image/jpeg",
            "content-length": String(bytes.byteLength),
          },
          chunks: [bytes],
        }),
      );

    await refreshGoogleAvatar(
      userDocument({
        avatarMediaId: new Types.ObjectId(OLD_MEDIA),
        providerAvatarFingerprint: "old-fingerprint",
      }),
      PICTURE,
      { fetchImpl },
    );

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://lh3.googleusercontent.com/a/final-photo",
      expect.objectContaining({ redirect: "manual", signal: expect.anything() }),
    );
    expect(mocks.persistImportedAvatarMedia).toHaveBeenCalledWith(USER, {
      bytes,
      contentType: "image/jpeg",
    });
    expect(mocks.attachMedia).toHaveBeenCalledWith(USER, NEW_MEDIA, {
      kind: "avatar",
      resourceId: USER,
    });
    expect(mocks.userFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: expect.anything(),
        avatarMediaId: expect.anything(),
        providerAvatarFingerprint: "old-fingerprint",
      }),
      {
        $set: {
          avatarMediaId: expect.anything(),
          providerAvatarFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      },
      { new: true, runValidators: true },
    );
    expect(mocks.detachMedia).toHaveBeenCalledWith(USER, OLD_MEDIA, {
      kind: "avatar",
      resourceId: USER,
    });
  });

  it("rejects a redirect that leaves the Google image allowlist", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({ status: 302, headers: { location: "https://evil.example/a" } }),
    );

    await expect(
      refreshGoogleAvatar(userDocument(), PICTURE, { fetchImpl }),
    ).rejects.toThrow(/trusted Google image URL/i);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(mocks.persistImportedAvatarMedia).not.toHaveBeenCalled();
  });

  it("limits provider redirects to three", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({ status: 302, headers: { location: "/a/next" } }),
    );

    await expect(
      refreshGoogleAvatar(userDocument(), PICTURE, { fetchImpl }),
    ).rejects.toThrow(/too many redirects/i);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("rejects non-images and declared or streamed bodies above 5 MiB", async () => {
    const tooLarge = 5 * 1024 * 1024 + 1;
    const nonImageFetch = vi.fn().mockResolvedValue(
      response({ headers: { "content-type": "text/html" }, chunks: [new Uint8Array([1])] }),
    );
    await expect(
      refreshGoogleAvatar(userDocument(), PICTURE, { fetchImpl: nonImageFetch }),
    ).rejects.toThrow(/image content type/i);

    const declaredFetch = vi.fn().mockResolvedValue(
      response({
        headers: { "content-type": "image/jpeg", "content-length": String(tooLarge) },
      }),
    );
    await expect(
      refreshGoogleAvatar(userDocument(), PICTURE, { fetchImpl: declaredFetch }),
    ).rejects.toThrow(/too large/i);

    const streamedFetch = vi.fn().mockResolvedValue(
      response({
        headers: { "content-type": "image/png" },
        chunks: [new Uint8Array(5 * 1024 * 1024), new Uint8Array(1)],
      }),
    );
    await expect(
      refreshGoogleAvatar(userDocument(), PICTURE, { fetchImpl: streamedFetch }),
    ).rejects.toThrow(/too large/i);
    expect(mocks.persistImportedAvatarMedia).not.toHaveBeenCalled();
  });

  it("aborts a provider request after five seconds", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    const pending = refreshGoogleAvatar(userDocument(), PICTURE, { fetchImpl });
    const rejection = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(5_001);

    await rejection;
  });

  it("does not fetch an unchanged claim or overwrite a custom avatar", async () => {
    const fetchImpl = vi.fn();
    const { createHash } = await import("node:crypto");
    const fingerprint = createHash("sha256").update(PICTURE).digest("hex");

    await refreshGoogleAvatar(
      userDocument({ providerAvatarFingerprint: fingerprint }),
      PICTURE,
      { fetchImpl },
    );
    expect(fetchImpl).not.toHaveBeenCalled();

    mocks.mediaFindOne.mockResolvedValueOnce({ source: "direct_upload" });
    await refreshGoogleAvatar(
      userDocument({ avatarMediaId: new Types.ObjectId(OLD_MEDIA) }),
      PICTURE,
      { fetchImpl },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rolls back the new link if a concurrent avatar update wins", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({
        headers: { "content-type": "image/webp" },
        chunks: [new Uint8Array([1, 2])],
      }),
    );
    mocks.userFindOneAndUpdate.mockResolvedValueOnce(null);

    await refreshGoogleAvatar(userDocument(), PICTURE, { fetchImpl });

    expect(mocks.detachMedia).toHaveBeenCalledWith(USER, NEW_MEDIA, {
      kind: "avatar",
      resourceId: USER,
    });
  });
});
