import { Platform } from "react-native";
import { APPSFLYER_APP_ID, APPSFLYER_DEV_KEY } from "../config";

type AppsFlyerAuthMethod = "apple" | "demo" | "google";
type AppsFlyerSuccessCallback = (result?: unknown) => unknown;
type AppsFlyerErrorCallback = (error?: unknown) => unknown;

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
  private readonly loadNativeClient: () => Promise<AppsFlyerNativeClient>;
  private readonly requestTrackingPermissions: () => Promise<TrackingPermissionResponse>;
  private readonly isTrackingTransparencyAvailable: () => boolean;
  private nativeClient?: AppsFlyerNativeClient;
  private initialized = false;

  public constructor(options: AppsFlyerServiceOptions = {}) {
    this.appId = options.appId;
    this.devKey = options.devKey;
    this.platformOS = options.platformOS ?? Platform.OS;
    this.devMode = options.devMode ?? isDevRuntime();
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
        client.setCustomerUserId(userId, () => resolve());
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

  public async initialize(userId?: string): Promise<boolean> {
    if (!this.hasConfig()) return false;

    const client = await this.getClient();
    if (this.initialized) {
      if (userId) {
        await this.setCustomerUserIdOnClient(client, userId);
      }
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

    const client = await this.getClient();
    await new Promise<void>((resolve, reject) => {
      try {
        const maybePromise = client.logEvent(
          "af_complete_registration",
          { af_registration_method: input.method },
          () => resolve(),
          reject,
        );
        if (isThenable(maybePromise)) {
          maybePromise.then(() => resolve()).catch(reject);
        }
      } catch (error) {
        reject(error);
      }
    });
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
          resolve(uid);
        });
      } catch (error) {
        reject(error);
      }
    });
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
});
