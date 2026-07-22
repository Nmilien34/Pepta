import { Platform } from "react-native";
import {
  APPSFLYER_APP_ID,
  APPSFLYER_DEV_KEY,
  APPSFLYER_DIAGNOSTIC_EVENT_ENABLED,
} from "../config";

type AppsFlyerAuthMethod = "apple" | "demo" | "google";
type AppsFlyerSuccessCallback = (result?: unknown) => unknown;
type AppsFlyerErrorCallback = (error?: unknown) => unknown;
type AppsFlyerUIDListener = (uid: string) => void;
type AppsFlyerUnsubscribe = () => void;

const APPSFLYER_UID_RETRY_DELAYS_MS = [250, 1_000, 3_000];
const APPSFLYER_DIAGNOSTIC_EVENT_NAME = "pepta_sdk_debug_ping";

interface AppsFlyerInitOptions {
  appId?: string;
  devKey: string;
  isDebug?: boolean;
  manualStart?: boolean;
  onDeepLinkListener?: boolean;
  onInstallConversionDataListener?: boolean;
  timeToWaitForATTUserAuthorization?: number;
}

export interface AppsFlyerNativeClient {
  initSdk(
    options: AppsFlyerInitOptions,
    success?: AppsFlyerSuccessCallback,
    error?: AppsFlyerErrorCallback,
  ): void | Promise<unknown>;
  startSdk(): void;
  disableSKAD?(disabled: boolean): void;
  setCustomerUserId(userId: string, success?: AppsFlyerSuccessCallback): void;
  logEvent(
    eventName: string,
    eventValues: Record<string, string>,
    success?: AppsFlyerSuccessCallback,
    error?: AppsFlyerErrorCallback,
  ): void | Promise<unknown>;
  getAppsFlyerUID(callback: (error: unknown, uid?: string) => unknown): void;
}

interface TrackingPermissionResponse {
  granted?: boolean;
  status?: string;
}

interface AppsFlyerServiceOptions {
  appId?: string;
  devKey?: string;
  platformOS?: string;
  devMode?: boolean;
  diagnosticEventEnabled?: boolean;
  nativeClient?: AppsFlyerNativeClient;
  loadNativeClient?: () => Promise<AppsFlyerNativeClient>;
  requestTrackingPermissions?: () => Promise<TrackingPermissionResponse>;
  isTrackingTransparencyAvailable?: () => boolean;
}

interface CompleteRegistrationInput {
  method: AppsFlyerAuthMethod;
}

async function loadNativeClient(): Promise<AppsFlyerNativeClient> {
  const appsFlyerModule = await import("react-native-appsflyer");
  return appsFlyerModule.default;
}

async function requestNativeTrackingPermissions(): Promise<TrackingPermissionResponse> {
  const trackingTransparency = await import("expo-tracking-transparency");
  if (!trackingTransparency.isAvailable()) {
    return { status: "unavailable", granted: false };
  }

  return trackingTransparency.requestTrackingPermissionsAsync();
}

function nativeTrackingTransparencyAvailable(): boolean {
  return true;
}

function isThenable(value: unknown): value is Promise<unknown> {
  return Boolean(value && typeof (value as Promise<unknown>).then === "function");
}

function isDevRuntime(): boolean {
  return typeof __DEV__ !== "undefined" ? __DEV__ : false;
}

function warnInDev(message: string, error?: unknown): void {
  if (!isDevRuntime()) return;
  if (error) {
    console.warn(message, error);
    return;
  }
  console.warn(message);
}

export class AppsFlyerService {
  private readonly appId?: string;
  private readonly devKey?: string;
  private readonly platformOS: string;
  private readonly devMode: boolean;
  private readonly diagnosticEventEnabled: boolean;
  private readonly loadNativeClient: () => Promise<AppsFlyerNativeClient>;
  private readonly requestTrackingPermissions: () => Promise<TrackingPermissionResponse>;
  private readonly isTrackingTransparencyAvailable: () => boolean;
  private nativeClient?: AppsFlyerNativeClient;
  private initialized = false;
  private diagnosticEventSent = false;
  private lastKnownUID?: string;
  private readonly uidListeners = new Set<AppsFlyerUIDListener>();
  private uidRetryTimer?: ReturnType<typeof setTimeout>;
  private uidRetryAttempt = 0;

  public constructor(options: AppsFlyerServiceOptions = {}) {
    this.appId = options.appId;
    this.devKey = options.devKey;
    this.platformOS = options.platformOS ?? Platform.OS;
    this.devMode = options.devMode ?? isDevRuntime();
    this.diagnosticEventEnabled = options.diagnosticEventEnabled ?? false;
    this.nativeClient = options.nativeClient;
    this.loadNativeClient = options.loadNativeClient ?? loadNativeClient;
    this.requestTrackingPermissions =
      options.requestTrackingPermissions ?? requestNativeTrackingPermissions;
    this.isTrackingTransparencyAvailable =
      options.isTrackingTransparencyAvailable ?? nativeTrackingTransparencyAvailable;
  }

  private hasConfig(): boolean {
    if (!this.devKey) return false;
    if (this.platformOS === "ios" && !this.appId) return false;
    return true;
  }

  private async getClient(): Promise<AppsFlyerNativeClient> {
    if (!this.nativeClient) {
      this.nativeClient = await this.loadNativeClient();
    }
    return this.nativeClient;
  }

  private notifyAppsFlyerUIDAvailable(uid?: string): void {
    if (!uid || uid === this.lastKnownUID) return;

    this.lastKnownUID = uid;
    this.uidListeners.forEach((listener) => listener(uid));
  }

  private clearAppsFlyerUIDRetry(): void {
    if (this.uidRetryTimer) {
      clearTimeout(this.uidRetryTimer);
      this.uidRetryTimer = undefined;
    }
    this.uidRetryAttempt = 0;
  }

  private scheduleAppsFlyerUIDRetry(): void {
    if (this.lastKnownUID || this.uidRetryTimer) return;

    const retryDelay = APPSFLYER_UID_RETRY_DELAYS_MS[this.uidRetryAttempt];
    if (retryDelay === undefined) return;

    this.uidRetryAttempt += 1;
    this.uidRetryTimer = setTimeout(() => {
      this.uidRetryTimer = undefined;
      void this.publishCurrentAppsFlyerUID().then((uid) => {
        if (!uid) {
          this.scheduleAppsFlyerUIDRetry();
        }
      });
    }, retryDelay);
  }

  private async publishCurrentAppsFlyerUID(): Promise<string | undefined> {
    const uid = await this.getAppsFlyerUID().catch((error) => {
      warnInDev("[AppsFlyer] Could not read AppsFlyer ID.", error);
      return undefined;
    });

    if (uid) {
      this.clearAppsFlyerUIDRetry();
    }

    return uid;
  }

  private publishCurrentAppsFlyerUIDWithRetry(): void {
    void this.publishCurrentAppsFlyerUID().then((uid) => {
      if (!uid) {
        this.scheduleAppsFlyerUIDRetry();
      }
    });
  }

  private async requestAttIfNeeded(): Promise<void> {
    if (this.platformOS !== "ios" || !this.isTrackingTransparencyAvailable()) {
      return;
    }

    try {
      await this.requestTrackingPermissions();
    } catch (error) {
      warnInDev("[AppsFlyer] ATT permission request failed.", error);
    }
  }

  private async setCustomerUserIdOnClient(
    client: AppsFlyerNativeClient,
    userId: string,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      try {
        client.setCustomerUserId(userId, () => undefined);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  private async initSdkOnClient(
    client: AppsFlyerNativeClient,
    options: AppsFlyerInitOptions,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      try {
        const maybePromise = client.initSdk(options, () => resolve(), reject);
        if (isThenable(maybePromise)) {
          maybePromise.then(() => resolve()).catch(reject);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  private async logEventOnClient(
    client: AppsFlyerNativeClient,
    eventName: string,
    eventValues: Record<string, string>,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      try {
        const maybePromise = client.logEvent(eventName, eventValues, () => resolve(), reject);
        if (isThenable(maybePromise)) {
          maybePromise.then(() => resolve()).catch(reject);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  private async logDiagnosticPingIfEnabled(client: AppsFlyerNativeClient): Promise<void> {
    if (!this.diagnosticEventEnabled || this.diagnosticEventSent) return;

    try {
      await this.logEventOnClient(client, APPSFLYER_DIAGNOSTIC_EVENT_NAME, {
        app: "pepta",
        source: "sdk",
      });
      this.diagnosticEventSent = true;
    } catch (error) {
      warnInDev("[AppsFlyer] Failed to log diagnostic SDK ping.", error);
    }
  }

  public async initialize(userId?: string): Promise<boolean> {
    if (!this.hasConfig()) return false;

    const client = await this.getClient();
    if (this.initialized) {
      if (userId) {
        await this.setCustomerUserIdOnClient(client, userId);
      }
      await this.logDiagnosticPingIfEnabled(client);
      this.publishCurrentAppsFlyerUIDWithRetry();
      return true;
    }

    await this.requestAttIfNeeded();
    if (this.platformOS === "ios") {
      client.disableSKAD?.(false);
    }

    if (userId) {
      await this.setCustomerUserIdOnClient(client, userId);
    }

    await this.initSdkOnClient(client, {
      appId: this.appId,
      devKey: this.devKey!,
      isDebug: this.devMode,
      manualStart: true,
      onDeepLinkListener: false,
      onInstallConversionDataListener: false,
    });
    client.startSdk();
    this.initialized = true;
    await this.logDiagnosticPingIfEnabled(client);
    this.publishCurrentAppsFlyerUIDWithRetry();
    return true;
  }

  public async setCustomerUserId(userId: string): Promise<void> {
    if (!this.hasConfig()) return;
    await this.setCustomerUserIdOnClient(await this.getClient(), userId);
  }

  public async logCompleteRegistration(input: CompleteRegistrationInput): Promise<void> {
    if (!this.hasConfig()) {
      warnInDev("[AppsFlyer] Missing app id or dev key; skipping af_complete_registration.");
      return;
    }

    await this.logEventOnClient(await this.getClient(), "af_complete_registration", {
      af_registration_method: input.method,
    });
  }

  /**
   * Fire-and-forget product analytics event. Callers must never pass PII or
   * raw user-entered input (e.g. send a code's status, not the code itself).
   */
  public async logAnalyticsEvent(
    eventName: string,
    eventValues: Record<string, string> = {},
  ): Promise<void> {
    if (!this.hasConfig()) return;
    try {
      await this.logEventOnClient(await this.getClient(), eventName, eventValues);
    } catch (error) {
      warnInDev(`[AppsFlyer] Failed to log ${eventName}.`, error);
    }
  }

  public async getAppsFlyerUID(): Promise<string | undefined> {
    if (!this.hasConfig()) return undefined;

    const client = await this.getClient();
    return new Promise<string | undefined>((resolve, reject) => {
      try {
        client.getAppsFlyerUID((error, uid) => {
          if (error) {
            reject(error);
            return;
          }
          this.notifyAppsFlyerUIDAvailable(uid);
          resolve(uid);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  public onAppsFlyerUIDAvailable(listener: AppsFlyerUIDListener): AppsFlyerUnsubscribe {
    this.uidListeners.add(listener);
    if (this.lastKnownUID) {
      listener(this.lastKnownUID);
    }

    return () => {
      this.uidListeners.delete(listener);
    };
  }
}

export function createAppsFlyerService(
  options: AppsFlyerServiceOptions = {},
): AppsFlyerService {
  return new AppsFlyerService(options);
}

export const appsFlyer = createAppsFlyerService({
  appId: APPSFLYER_APP_ID,
  devKey: APPSFLYER_DEV_KEY,
  diagnosticEventEnabled: APPSFLYER_DIAGNOSTIC_EVENT_ENABLED,
});
