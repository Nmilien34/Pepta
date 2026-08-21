import { describe, expect, it, vi } from "vitest";
import { uploadAvatar } from "./avatar.service";

vi.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
}));

describe("avatar.service", () => {
  it("uploads through the common media pipeline and activates only its media id", async () => {
    const api = {
      uploadMediaPhoto: vi.fn().mockResolvedValue({
        mediaId: "507f1f77bcf86cd799439011",
        status: "ready",
      }),
      confirmAvatarUpload: vi.fn().mockResolvedValue({
        id: "507f1f77bcf86cd799439012",
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
      { api },
    );

    expect(api.uploadMediaPhoto).toHaveBeenCalledWith({
      intent: "avatar",
      uri: "file:///tmp/avatar.png",
      contentType: "image/png",
    });
    expect(api.confirmAvatarUpload).toHaveBeenCalledWith({
      mediaId: "507f1f77bcf86cd799439011",
    });
    expect(api.confirmAvatarUpload.mock.calls[0]?.[0]).not.toHaveProperty("key");
    expect(result.hasAvatar).toBe(true);
  });
});
