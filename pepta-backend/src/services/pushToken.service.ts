import {
  notificationPreferencesResponseSchema,
  pushTokenRegistrationResponseSchema,
  type NotificationPreferencesPatch,
  type NotificationPreferencesResponse,
  type PushTokenRegistrationRequest,
  type PushTokenRegistrationResponse,
} from "@pepta/shared";
import { NotFoundError } from "../lib/errors";
import { PushTokenModel, UserModel } from "../models";

function documentObject(document: unknown): Record<string, unknown> {
  if (document && typeof document === "object") {
    const maybeDocument = document as { toObject?: unknown };
    if (typeof maybeDocument.toObject === "function") {
      const value = maybeDocument.toObject();
      return value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    }
    return document as Record<string, unknown>;
  }

  return {};
}

function dateToIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { toISOString?: unknown }).toISOString === "function"
  ) {
    return (value as { toISOString: () => string }).toISOString();
  }
  return null;
}

function serializePushToken(document: unknown): PushTokenRegistrationResponse {
  const value = documentObject(document);
  return pushTokenRegistrationResponseSchema.parse({
    token: value.token,
    platform: value.platform,
    enabled: value.enabled === true,
    lastSeenAt: dateToIso(value.lastSeenAt),
  });
}

function serializeNotificationPreferences(
  value: unknown,
): NotificationPreferencesResponse {
  const preferences = documentObject(value);
  const aiPushCopyConsent = preferences.aiPushCopyConsent === true;
  return notificationPreferencesResponseSchema.parse({
    aiPushCopyConsent,
    aiPushCopyConsentAt: aiPushCopyConsent
      ? dateToIso(preferences.aiPushCopyConsentAt)
      : null,
    aiPushCopyConsentRevokedAt:
      dateToIso(preferences.aiPushCopyConsentRevokedAt) ?? null,
  });
}

export async function registerPushToken(
  userId: string,
  input: PushTokenRegistrationRequest,
  now = new Date(),
): Promise<PushTokenRegistrationResponse> {
  const token = await PushTokenModel.findOneAndUpdate(
    { userId, token: input.token },
    {
      $set: {
        platform: input.platform,
        deviceId: input.deviceId,
        appVersion: input.appVersion,
        enabled: true,
        lastSeenAt: now,
      },
      $setOnInsert: {
        userId,
        token: input.token,
      },
    },
    { new: true, upsert: true, runValidators: true },
  );

  return serializePushToken(token);
}

export async function updateNotificationPreferences(
  userId: string,
  patch: NotificationPreferencesPatch,
  now = new Date(),
): Promise<NotificationPreferencesResponse> {
  const update = patch.aiPushCopyConsent
    ? {
        $set: {
          "notificationPreferences.aiPushCopyConsent": true,
          "notificationPreferences.aiPushCopyConsentAt": now,
          "notificationPreferences.aiPushCopyConsentRevokedAt": null,
        },
      }
    : {
        $set: {
          "notificationPreferences.aiPushCopyConsent": false,
          "notificationPreferences.aiPushCopyConsentAt": null,
          "notificationPreferences.aiPushCopyConsentRevokedAt": now,
        },
      };

  const user = await UserModel.findByIdAndUpdate(userId, update, {
    new: true,
    runValidators: true,
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  return serializeNotificationPreferences(
    documentObject(user).notificationPreferences,
  );
}

export async function getNotificationPreferences(
  userId: string,
): Promise<NotificationPreferencesResponse> {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new NotFoundError("User not found");
  }
  return serializeNotificationPreferences(
    documentObject(user).notificationPreferences,
  );
}

export async function disablePushToken(token: string, now = new Date()) {
  await PushTokenModel.findOneAndUpdate(
    { token },
    { $set: { enabled: false, disabledAt: now } },
    { new: true },
  );
}
