// Trial-experiment funnel events over AppsFlyer. Names and moments are the
// experiment contract:
//   onboarding_started    — first onboarding screen after a fresh install
//   onboarding_completed  — last step done, immediately before the paywall
//   paywall_shown         — paywall visible (variant = offering identifier)
//   purchase_started      — CTA tapped, before the StoreKit sheet
// The first two are once-per-install (AsyncStorage guard); paywall_shown is
// once per presentation (component guard); purchase_started fires per tap.
// af_purchase / completion tracking already exists elsewhere — not duplicated
// here. Fire-and-forget: analytics must never block or break the flow.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { appsFlyer } from "./appsflyer";

const ONCE_KEY_PREFIX = "pepta:funnel:";

// In-memory de-dupe so racing calls in one session can't double-fire while
// the AsyncStorage write is still in flight.
const firedThisSession = new Set<string>();

async function logOncePerInstall(
  eventName: string,
  eventValues: Record<string, string> = {},
): Promise<void> {
  if (firedThisSession.has(eventName)) return;
  firedThisSession.add(eventName);
  try {
    const key = `${ONCE_KEY_PREFIX}${eventName}`;
    const already = await AsyncStorage.getItem(key);
    if (already) return;
    await appsFlyer.logAnalyticsEvent(eventName, eventValues);
    await AsyncStorage.setItem(key, new Date().toISOString());
  } catch (error) {
    console.warn(`[Funnel] Failed to log ${eventName}.`, error);
  }
}

export function logOnboardingStarted(): void {
  void logOncePerInstall("onboarding_started");
}

export function logOnboardingCompleted(): void {
  void logOncePerInstall("onboarding_completed");
}

// Per-step onboarding progress. ONE event carrying the step as a parameter
// rather than 38 event names, so the dropoff curve is a single breakdown in
// AppsFlyer. `index` is the position in ONBOARDING_STEPS (the canonical order,
// not a per-user counter) so curves stay comparable across users whose skip
// paths differ.
//
// De-dupe is IN-MEMORY on purpose: unlike onboarding_started, someone who
// abandons and returns in a later session should legitimately re-enter the
// curve. Within one session, back-navigation and remounts must not re-fire.
const stepsSeenThisSession = new Set<string>();

export function logOnboardingStep(stepId: string, index: number): void {
  if (stepsSeenThisSession.has(stepId)) return;
  stepsSeenThisSession.add(stepId);
  // The AppsFlyer wrapper takes string values only.
  void appsFlyer.logAnalyticsEvent("onboarding_step", {
    step: stepId,
    index: String(index),
  });
}

export function logPaywallShown(variant: string): void {
  void appsFlyer.logAnalyticsEvent("paywall_shown", { variant });
}

export function logPurchaseStarted(
  variant: string,
  packageType: "monthly" | "annual",
): void {
  void appsFlyer.logAnalyticsEvent("purchase_started", {
    variant,
    package: packageType,
  });
}

/** Test hook: clears the session de-dupe. */
export function resetFunnelSessionGuardsForTest(): void {
  firedThisSession.clear();
  stepsSeenThisSession.clear();
}
