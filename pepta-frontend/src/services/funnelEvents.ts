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

export function logPaywallShown(
  variant: string,
  extras: {
    defaultSelectedPlan: string;
    /** Trial copy visible on first render FOR THE DEFAULT-SELECTED plan. */
    trialCopyShown: boolean;
    /** Which plans carried visible trial copy: none | monthly | yearly | both. */
    trialCopyPlans: "none" | "monthly" | "yearly" | "both";
  },
): void {
  // The wrapper takes string values only, so bools are stringified.
  void appsFlyer.logAnalyticsEvent("paywall_shown", {
    variant,
    defaultSelectedPlan: extras.defaultSelectedPlan,
    trialCopyShown: String(extras.trialCopyShown),
    trialCopyPlans: extras.trialCopyPlans,
  });
}

export interface PaywallPackageDebug {
  productId: string;
  hasIntroPrice: boolean;
  introOfferPeriod: string | null;
  rawEligibilityStatus: number | null;
  trialEligible: boolean;
}

// TODO(remove): temporary paywall diagnostic. One event per paywall open,
// answering on a cable-free TestFlight build: which offering came back, and
// PER PACKAGE whether it carried an intro offer, what Apple's raw eligibility
// status was, and how it mapped. Delete once trial-on-both-plans is confirmed
// healthy in AppsFlyer.
export function logPaywallOfferingDebug(payload: {
  offeringId: string;
  monthly: PaywallPackageDebug;
  yearly: PaywallPackageDebug;
  trialCopyShown: boolean;
}): void {
  const flat = (prefix: "monthly" | "yearly", pkg: PaywallPackageDebug) => ({
    [`${prefix}ProductId`]: pkg.productId,
    [`${prefix}HasIntro`]: String(pkg.hasIntroPrice),
    [`${prefix}IntroPeriod`]: pkg.introOfferPeriod ?? "null",
    [`${prefix}EligibilityStatus`]:
      pkg.rawEligibilityStatus === null ? "null" : String(pkg.rawEligibilityStatus),
    [`${prefix}TrialEligible`]: String(pkg.trialEligible),
  });
  void appsFlyer.logAnalyticsEvent("paywall_offering_debug", {
    offeringId: payload.offeringId,
    ...flat("monthly", payload.monthly),
    ...flat("yearly", payload.yearly),
    trialCopyShown: String(payload.trialCopyShown),
  });
}

/**
 * The paywall is a hard wall with no dismiss affordance, so "dismissed" here
 * means the user LEFT THE APP from the paywall (backgrounded without
 * purchasing) — the only exit that exists. Fired at most once per paywall
 * presentation.
 */
export function logPaywallDismissed(payload: {
  variant: string;
  selectedPlan: string;
  trialCopyShown: boolean;
}): void {
  void appsFlyer.logAnalyticsEvent("paywall_dismissed", {
    variant: payload.variant,
    selectedPlan: payload.selectedPlan,
    trialCopyShown: String(payload.trialCopyShown),
  });
}

// The reveal's claim tap (signed-out users only): tapping Start today is the
// self-initiated step BEFORE the save-your-plan sheet. Instrumented apart
// from af_complete_registration so the funnel can distinguish "bounced off
// the payoff" from "refused the identity ask". Once per session — reopening
// the sheet after a dismissal is the same decision, not a new funnel entry.
let revealClaimLogged = false;
export function logRevealClaimTapped(): void {
  if (revealClaimLogged) return;
  revealClaimLogged = true;
  void appsFlyer.logAnalyticsEvent("reveal_claim_tapped", {});
}

// Update-prompt engagement: shown fires once per displayed prompt, action
// fires per button press, so shown-without-action measures ignored prompts.
export function logUpdatePromptShown(payload: {
  runningVersion: string;
  latestVersion: string | null;
  mode: "soft" | "hard";
}): void {
  void appsFlyer.logAnalyticsEvent("update_prompt_shown", {
    runningVersion: payload.runningVersion,
    latestVersion: payload.latestVersion ?? "null",
    mode: payload.mode,
  });
}

export function logUpdatePromptAction(action: "update" | "later"): void {
  void appsFlyer.logAnalyticsEvent("update_prompt_action", { action });
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
  revealClaimLogged = false;
}
