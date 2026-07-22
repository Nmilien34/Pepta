// Launch-time App Tracking Transparency prompt.
//
// Guideline 2.1 rejection (2026-07-20, 1.0.1 (13)): the only ATT request
// lived inside AppsFlyer initialization, which runs after sign-in — and auth
// sits at the END of the onboarding funnel. A reviewer on a fresh install
// never authenticates, so the prompt never appeared. The request must fire at
// launch, independent of auth.
//
// It also must wait for the app to be foreground-active: iOS silently drops
// the ATT dialog (resolving "undetermined" with no UI) when it is requested
// while the app is still launching. We wait for `active`, let the first
// screen paint, then ask — and re-try on each foreground until iOS reports a
// determined status. AppsFlyer's own pre-init request stays as a no-op
// safety net (iOS never re-prompts once the status is determined).

import { AppState, Platform } from "react-native";

interface TrackingPermissionResponse {
  status?: string;
  granted?: boolean;
}

type AppStateListener = (state: string) => void;
type Unsubscribe = () => void;

interface AttLaunchPromptOptions {
  platformOS?: string;
  currentAppState?: () => string;
  onAppStateChange?: (listener: AppStateListener) => Unsubscribe;
  getTrackingPermissions?: () => Promise<TrackingPermissionResponse>;
  requestTrackingPermissions?: () => Promise<TrackingPermissionResponse>;
  /** Small pause after becoming active so the first screen paints under the dialog. */
  settleDelayMs?: number;
  delay?: (ms: number) => Promise<void>;
}

async function getNativeTrackingPermissions(): Promise<TrackingPermissionResponse> {
  const trackingTransparency = await import("expo-tracking-transparency");
  if (!trackingTransparency.isAvailable()) {
    return { status: "unavailable", granted: false };
  }
  return trackingTransparency.getTrackingPermissionsAsync();
}

async function requestNativeTrackingPermissions(): Promise<TrackingPermissionResponse> {
  const trackingTransparency = await import("expo-tracking-transparency");
  if (!trackingTransparency.isAvailable()) {
    return { status: "unavailable", granted: false };
  }
  return trackingTransparency.requestTrackingPermissionsAsync();
}

function subscribeToAppState(listener: AppStateListener): Unsubscribe {
  const subscription = AppState.addEventListener("change", (state) => {
    listener(state);
  });
  return () => subscription.remove();
}

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AttLaunchPrompt {
  private readonly platformOS: string;
  private readonly currentAppState: () => string;
  private readonly onAppStateChange: (listener: AppStateListener) => Unsubscribe;
  private readonly getTrackingPermissions: () => Promise<TrackingPermissionResponse>;
  private readonly requestTrackingPermissions: () => Promise<TrackingPermissionResponse>;
  private readonly settleDelayMs: number;
  private readonly delay: (ms: number) => Promise<void>;
  private started = false;
  private attemptInFlight = false;
  private unsubscribe?: Unsubscribe;

  public constructor(options: AttLaunchPromptOptions = {}) {
    this.platformOS = options.platformOS ?? Platform.OS;
    this.currentAppState =
      options.currentAppState ?? (() => AppState.currentState);
    this.onAppStateChange = options.onAppStateChange ?? subscribeToAppState;
    this.getTrackingPermissions =
      options.getTrackingPermissions ?? getNativeTrackingPermissions;
    this.requestTrackingPermissions =
      options.requestTrackingPermissions ?? requestNativeTrackingPermissions;
    this.settleDelayMs = options.settleDelayMs ?? 400;
    this.delay = options.delay ?? defaultDelay;
  }

  /** Idempotent. Call once from the app root on mount. */
  public start(): void {
    if (this.platformOS !== "ios" || this.started) return;
    this.started = true;

    this.unsubscribe = this.onAppStateChange((state) => {
      if (state === "active") void this.attempt();
    });
    if (this.currentAppState() === "active") {
      void this.attempt();
    }
  }

  private finish(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private async attempt(): Promise<void> {
    if (this.attemptInFlight) return;
    this.attemptInFlight = true;
    try {
      const current = await this.getTrackingPermissions();
      if (current.status === "unavailable") {
        this.finish();
        return;
      }
      if (current.status !== "undetermined") {
        // Already answered — iOS never re-prompts.
        this.finish();
        return;
      }

      await this.delay(this.settleDelayMs);
      const result = await this.requestTrackingPermissions();
      // "undetermined" back from a request means iOS suppressed the dialog
      // (app not fully active yet) — keep the subscription and retry on the
      // next foreground.
      if (result.status !== "undetermined") {
        this.finish();
      }
    } catch {
      // Permission plumbing failed; leave the subscription so a later
      // foreground can retry.
    } finally {
      this.attemptInFlight = false;
    }
  }
}

export function createAttLaunchPrompt(
  options: AttLaunchPromptOptions = {},
): AttLaunchPrompt {
  return new AttLaunchPrompt(options);
}

export const attLaunchPrompt = createAttLaunchPrompt();
