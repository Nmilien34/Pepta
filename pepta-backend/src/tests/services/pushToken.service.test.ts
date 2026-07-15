import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pushTokenFindOneAndUpdate: vi.fn(),
  userFindByIdAndUpdate: vi.fn(),
}));

vi.mock("../../models", () => ({
  PushTokenModel: {
    findOneAndUpdate: mocks.pushTokenFindOneAndUpdate,
  },
  UserModel: {
    findByIdAndUpdate: mocks.userFindByIdAndUpdate,
  },
}));

import {
  registerPushToken,
  updateNotificationPreferences,
} from "../../services/pushToken.service";

const now = new Date("2026-06-21T14:30:00.000Z");

function pushTokenDocument(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    token: "ExponentPushToken[abc123]",
    platform: "ios",
    enabled: true,
    lastSeenAt: now,
    toObject: () => ({
      userId: "user-1",
      token: "ExponentPushToken[abc123]",
      platform: "ios",
      enabled: true,
      lastSeenAt: now,
      ...overrides,
    }),
  };
}

function userDocument(preferences: Record<string, unknown>) {
  return {
    notificationPreferences: preferences,
    toObject: () => ({ notificationPreferences: preferences }),
  };
}

describe("push token service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pushTokenFindOneAndUpdate.mockResolvedValue(pushTokenDocument());
  });

  it("upserts an enabled Expo push token for the authenticated device", async () => {
    const result = await registerPushToken(
      "user-1",
      {
        token: "ExponentPushToken[abc123]",
        platform: "ios",
        deviceId: "iphone-1",
        appVersion: "1.0.0",
      },
      now,
    );

    expect(mocks.pushTokenFindOneAndUpdate).toHaveBeenCalledWith(
      { userId: "user-1", token: "ExponentPushToken[abc123]" },
      {
        $set: {
          platform: "ios",
          deviceId: "iphone-1",
          appVersion: "1.0.0",
          enabled: true,
          lastSeenAt: now,
        },
        $setOnInsert: {
          userId: "user-1",
          token: "ExponentPushToken[abc123]",
        },
      },
      { new: true, upsert: true, runValidators: true },
    );
    expect(result).toEqual({
      token: "ExponentPushToken[abc123]",
      platform: "ios",
      enabled: true,
      lastSeenAt: now.toISOString(),
    });
  });

  it("stamps AI push consent server-side when the user opts in", async () => {
    mocks.userFindByIdAndUpdate.mockResolvedValue(
      userDocument({
        aiPushCopyConsent: true,
        aiPushCopyConsentAt: now,
        aiPushCopyConsentRevokedAt: null,
      }),
    );

    const result = await updateNotificationPreferences(
      "user-1",
      { aiPushCopyConsent: true },
      now,
    );

    expect(mocks.userFindByIdAndUpdate).toHaveBeenCalledWith(
      "user-1",
      {
        $set: {
          "notificationPreferences.aiPushCopyConsent": true,
          "notificationPreferences.aiPushCopyConsentAt": now,
          "notificationPreferences.aiPushCopyConsentRevokedAt": null,
        },
      },
      { new: true, runValidators: true },
    );
    expect(result).toEqual({
      aiPushCopyConsent: true,
      aiPushCopyConsentAt: now.toISOString(),
      aiPushCopyConsentRevokedAt: null,
    });
  });

  it("revokes AI push consent without disabling ordinary push tokens", async () => {
    mocks.userFindByIdAndUpdate.mockResolvedValue(
      userDocument({
        aiPushCopyConsent: false,
        aiPushCopyConsentAt: null,
        aiPushCopyConsentRevokedAt: now,
      }),
    );

    const result = await updateNotificationPreferences(
      "user-1",
      { aiPushCopyConsent: false },
      now,
    );

    expect(mocks.userFindByIdAndUpdate).toHaveBeenCalledWith(
      "user-1",
      {
        $set: {
          "notificationPreferences.aiPushCopyConsent": false,
          "notificationPreferences.aiPushCopyConsentAt": null,
          "notificationPreferences.aiPushCopyConsentRevokedAt": now,
        },
      },
      { new: true, runValidators: true },
    );
    expect(result.aiPushCopyConsent).toBe(false);
  });
});
