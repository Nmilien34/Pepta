import { describe, expect, it, vi } from "vitest";
import { uploadAvatar } from "./avatar.service";

vi.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
}));

describe("avatar.service", () => {
  it("uploads picked avatar bytes through the presigned S3 flow", async () => {
    const blob = new Blob(["avatar-bytes"], { type: "image/png" });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ blob: () => Promise.resolve(blob) })
      .mockResolvedValueOnce({ ok: true });
    const api = {
      createAvatarUploadIntent: vi.fn().mockResolvedValue({
        key: "pepta/avatars/user-1/avatar.png",
        uploadUrl: "https://signed.example/upload",
        expiresAt: "2026-06-21T00:10:00.000Z",
      }),
      confirmAvatarUpload: vi.fn().mockResolvedValue({
        id: "user-1",
        emailVerified: true,
        hasAvatar: true,
        authProviders: [],
        entitlement: { status: "free", expiresAt: null, willRenew: false },
        onboardingComplete: true,
        createdAt: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:00:00.000Z",
      }),
    };

    const result = await uploadAvatar(
      { uri: "file:///tmp/avatar.png", contentType: "image/png" },
      { api, fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(api.createAvatarUploadIntent).toHaveBeenCalledWith({
      contentType: "image/png",
      sizeBytes: blob.size,
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://signed.example/upload",
      {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: blob,
      },
    );
    expect(api.confirmAvatarUpload).toHaveBeenCalledWith({
      key: "pepta/avatars/user-1/avatar.png",
    });
    expect(result.hasAvatar).toBe(true);
  });
});
