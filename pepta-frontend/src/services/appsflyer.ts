import { attLaunchPrompt } from "./attPrompt";
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
  /**
   * Resolves once ATT has a DETERMINED status. Injected rather than imported
   * so the dependency is explicit — see the ordering note on startSdk below.
   */
  waitForAttSettled?: () => Promise<void>;
  /** Ceiling on that wait. Defaults to ATT_WAIT_TIMEOUT_MS. */
  attWaitTimeoutMs?: number;
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

/**
 * 60 seconds, matching what AppsFlyer documents for
 * timeToWaitForATTUserAuthorization and what we now pass to the native SDK.
 *
 * It is a CEILING, not a delay: the wait ends the instant ATT resolves, which
 * for a user who answers the dialog is a couple of seconds. The ceiling only
 * matters for someone who leaves the dialog on screen and backgrounds the
 * app — and there the right answer is to send the install without an IDFA
 * rather than lose it entirely, so the two mechanisms agree on the number.
 */
export const ATT_WAIT_TIMEOUT_MS = 60_000;

export class AppsFlyerService {
  private readonly appId?: string;
  private readonly devKey?: string;
  private readonly waitForAttSettled?: () => Promise<void>;
  private readonly attWaitTimeoutMs: number;
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
    this.waitForAttSettled = options.waitForAttSettled;
    this.attWaitTimeoutMs = options.attWaitTimeoutMs ?? ATT_WAIT_TIMEOUT_MS;
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
      // Declared in this file's own interface since it was written and never
      // once passed. The native SDK holds its own install event for ATT; the
      // gate below holds startSdk. Both, deliberately — belt and braces on the
      // single thing that made every Facebook install look organic.
      timeToWaitForATTUserAuthorization: ATT_WAIT_TIMEOUT_MS / 1000,
    });

    // THE INSTALL EVENT WAITS FOR ATT.
    //
    // `manualStart: true` above is what makes this possible: initSdk does not
    // send the install, startSdk does. This line used to sit immediately after
    // initSdk, so the install went out before the ATT dialog had even been
    // REQUESTED and carried no IDFA whatever the user later chose.
    //
    // It used to depend on effect ordering too — AppsFlyer initialises from
    // AuthProvider's mount effect and ATT from App.tsx's, and React runs child
    // effects before parent effects, so AppsFlyer always won. That ordering is
    // now irrelevant: the dependency is awaited explicitly and cannot silently
    // invert.
    await this.awaitAttSettled();
    client.startSdk();
    this.initialized = true;
    await this.logDiagnosticPingIfEnabled(client);
    this.publishCurrentAppsFlyerUIDWithRetry();
    return true;
  }

  /**
   * Wait for ATT, but never forever. A user who leaves the dialog on screen
   * must not cost us the install entirely — after the ceiling we start
   * without an IDFA, which is strictly better than not attributing at all.
   */
  private async awaitAttSettled(): Promise<void> {
    if (!this.waitForAttSettled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.waitForAttSettled(),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, this.attWaitTimeoutMs);
        }),
      ]);
    } catch {
      // A broken ATT probe is not a reason to withhold the install.
    } finally {
      if (timer) clearTimeout(timer);
    }
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
  // Explicit dependency on the launch-time ATT prompt. attLaunchPrompt.start()
  // is idempotent and App.tsx still calls it at launch, independent of auth —
  // that placement is what fixed the Guideline 2.1 rejection and is untouched.
  // Calling it here as well only removes the effect-ordering assumption: if
  // AppsFlyer somehow initialises first, it starts the prompt rather than
  // racing it.
  waitForAttSettled: () => {
    attLaunchPrompt.start();
    return attLaunchPrompt.whenSettled();
  },
});
