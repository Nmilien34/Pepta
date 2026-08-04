import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  logOnboardingCompleted,
  logPaywallDismissed,
  logPaywallOfferingDebug,
  logOnboardingStarted,
  logOnboardingStep,
  logPaywallShown,
  logPurchaseStarted,
  logRevealClaimTapped,
  logUpdatePromptAction,
  logUpdatePromptShown,
  resetFunnelSessionGuardsForTest,
} from "./funnelEvents";

const mocks = vi.hoisted(() => ({
  logAnalyticsEvent: vi.fn(() => Promise.resolve()),
  store: new Map<string, string>(),
}));

vi.mock("./appsflyer", () => ({
  appsFlyer: { logAnalyticsEvent: mocks.logAnalyticsEvent },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(mocks.store.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      mocks.store.set(key, value);
      return Promise.resolve();
    }),
  },
}));

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("funnel events", () => {
  beforeEach(() => {
    mocks.logAnalyticsEvent.mockClear();
    mocks.store.clear();
    resetFunnelSessionGuardsForTest();
  });

  it("fires onboarding_started once per install, surviving re-mounts and restarts", async () => {
    logOnboardingStarted();
    logOnboardingStarted(); // same-session re-mount
    await settle();
    expect(mocks.logAnalyticsEvent).toHaveBeenCalledTimes(1);
    expect(mocks.logAnalyticsEvent).toHaveBeenCalledWith("onboarding_started", {});

    // "Restart": session guard clears, but the AsyncStorage flag persists.
    resetFunnelSessionGuardsForTest();
    logOnboardingStarted();
    await settle();
    expect(mocks.logAnalyticsEvent).toHaveBeenCalledTimes(1);
  });

  it("fires onboarding_completed once per install", async () => {
    logOnboardingCompleted();
    logOnboardingCompleted();
    await settle();
    expect(mocks.logAnalyticsEvent).toHaveBeenCalledTimes(1);
    expect(mocks.logAnalyticsEvent).toHaveBeenCalledWith("onboarding_completed", {});
  });

  it("passes the offering variant through paywall_shown, with unambiguous trial scope", async () => {
    logPaywallShown("trial-offer", {
      defaultSelectedPlan: "yearly",
      trialCopyShown: true,
      trialCopyPlans: "both",
    });
    await settle();
    expect(mocks.logAnalyticsEvent).toHaveBeenCalledWith("paywall_shown", {
      variant: "trial-offer",
      defaultSelectedPlan: "yearly",
      trialCopyShown: "true",
      trialCopyPlans: "both",
    });
  });

  it("flattens paywall_offering_debug per package", async () => {
    logPaywallOfferingDebug({
      offeringId: "default",
      monthly: {
        productId: "ai.boltzman.pepta.monthly.trial",
        hasIntroPrice: true,
        introOfferPeriod: "3 day",
        rawEligibilityStatus: 2,
        trialEligible: true,
      },
      yearly: {
        productId: "ai.boltzman.pepta.annual",
        hasIntroPrice: false,
        introOfferPeriod: null,
        rawEligibilityStatus: null,
        trialEligible: false,
      },
      trialCopyShown: false,
    });
    await settle();
    expect(mocks.logAnalyticsEvent).toHaveBeenCalledWith("paywall_offering_debug", {
      offeringId: "default",
      monthlyProductId: "ai.boltzman.pepta.monthly.trial",
      monthlyHasIntro: "true",
      monthlyIntroPeriod: "3 day",
      monthlyEligibilityStatus: "2",
      monthlyTrialEligible: "true",
      yearlyProductId: "ai.boltzman.pepta.annual",
      yearlyHasIntro: "false",
      yearlyIntroPeriod: "null",
      yearlyEligibilityStatus: "null",
      yearlyTrialEligible: "false",
      trialCopyShown: "false",
    });
  });

  it("stringifies paywall_dismissed", async () => {
    logPaywallDismissed({ variant: "default", selectedPlan: "yearly", trialCopyShown: true });
    await settle();
    expect(mocks.logAnalyticsEvent).toHaveBeenCalledWith("paywall_dismissed", {
      variant: "default",
      selectedPlan: "yearly",
      trialCopyShown: "true",
    });
  });

  it("fires reveal_claim_tapped once per session (reopening the sheet is the same decision)", async () => {
    logRevealClaimTapped();
    logRevealClaimTapped();
    await settle();
    expect(mocks.logAnalyticsEvent).toHaveBeenCalledTimes(1);
    expect(mocks.logAnalyticsEvent).toHaveBeenCalledWith("reveal_claim_tapped", {});
    // a fresh session re-enters the funnel
    resetFunnelSessionGuardsForTest();
    logRevealClaimTapped();
    await settle();
    expect(mocks.logAnalyticsEvent).toHaveBeenCalledTimes(2);
  });

  it("passes variant + package through purchase_started", async () => {
    logPurchaseStarted("default", "annual");
    await settle();
    expect(mocks.logAnalyticsEvent).toHaveBeenCalledWith("purchase_started", {
      variant: "default",
      package: "annual",
    });
  });

  it("stringifies update-prompt events, mapping a null latestVersion to \"null\"", async () => {
    logUpdatePromptShown({ runningVersion: "1.0.4", latestVersion: "1.0.5", mode: "soft" });
    logUpdatePromptShown({ runningVersion: "1.0.4", latestVersion: null, mode: "hard" });
    logUpdatePromptAction("later");
    await settle();
    expect(mocks.logAnalyticsEvent).toHaveBeenCalledWith("update_prompt_shown", {
      runningVersion: "1.0.4",
      latestVersion: "1.0.5",
      mode: "soft",
    });
    expect(mocks.logAnalyticsEvent).toHaveBeenCalledWith("update_prompt_shown", {
      runningVersion: "1.0.4",
      latestVersion: "null",
      mode: "hard",
    });
    expect(mocks.logAnalyticsEvent).toHaveBeenCalledWith("update_prompt_action", {
      action: "later",
    });
  });

  it("reports each onboarding step once, with its canonical index", async () => {
    logOnboardingStep("welcome", 0);
    logOnboardingStep("journeyStage", 2);
    await settle();

    expect(mocks.logAnalyticsEvent).toHaveBeenCalledWith("onboarding_step", {
      step: "welcome",
      index: "0",
    });
    expect(mocks.logAnalyticsEvent).toHaveBeenCalledWith("onboarding_step", {
      step: "journeyStage",
      index: "2",
    });
    expect(mocks.logAnalyticsEvent).toHaveBeenCalledTimes(2);
  });

  it("does not re-fire when a step is revisited (back-nav or remount)", async () => {
    logOnboardingStep("goalWeight", 20);
    logOnboardingStep("goalPace", 21);
    // user steps back, then forward again — and the navigator remounts
    logOnboardingStep("goalWeight", 20);
    logOnboardingStep("goalPace", 21);
    await settle();

    expect(mocks.logAnalyticsEvent).toHaveBeenCalledTimes(2);
  });

  it("lets a later session re-enter the curve (de-dupe is in-memory only)", async () => {
    logOnboardingStep("welcome", 0);
    await settle();
    expect(mocks.logAnalyticsEvent).toHaveBeenCalledTimes(1);

    // A new session starts with a fresh guard — unlike onboarding_started,
    // this must NOT be suppressed by a persisted once-per-install flag.
    resetFunnelSessionGuardsForTest();
    logOnboardingStep("welcome", 0);
    await settle();
    expect(mocks.logAnalyticsEvent).toHaveBeenCalledTimes(2);
  });

  it("never writes a once-per-install key for step events", async () => {
    logOnboardingStep("welcome", 0);
    await settle();
    // AsyncStorage is where onboarding_started's guard lives; steps must stay
    // out of it or a returning user would vanish from the curve forever.
    expect(mocks.store.size).toBe(0);
  });
});
