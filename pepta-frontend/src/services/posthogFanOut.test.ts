// PostHog as a second analytics destination.
//
// These run the REAL funnelEvents and the REAL posthog module — the only
// things faked are the two edges: the AppsFlyer native wrapper and the PostHog
// SDK client. Mocking funnelEvents itself would assert nothing, since the
// fan-out IS the unit under test.
//
// The property that matters most is not "PostHog receives events". It is that
// PostHog CANNOT HURT ANYTHING: a throwing client must leave AppsFlyer's send
// intact, must not reject into the caller, and must not consume the
// once-per-install AsyncStorage token that guards onboarding_started.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  afEvents: [] as Array<{ name: string; values: Record<string, string> }>,
  phEvents: [] as Array<{ name: string; props?: Record<string, string> }>,
  phThrows: false,
  store: new Map<string, string>(),
}));

vi.mock("./appsflyer", () => ({
  appsFlyer: {
    logAnalyticsEvent: vi.fn((name: string, values: Record<string, string> = {}) => {
      mocks.afEvents.push({ name, values });
      return Promise.resolve(true);
    }),
  },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (k: string) => Promise.resolve(mocks.store.get(k) ?? null),
    setItem: (k: string, v: string) => {
      mocks.store.set(k, v);
      return Promise.resolve();
    },
  },
}));

// The SDK edge only. posthog.ts's own logic — the null guard, the try/catch,
// the swallow — is the real implementation under test.
vi.mock("posthog-react-native", () => ({ default: class {} }));

import {
  logOnboardingStarted,
  logOnboardingStep,
  logPurchaseStarted,
  resetFunnelSessionGuardsForTest,
} from "./funnelEvents";
import { resetPostHogInitForTest, setPostHogClientForTest } from "./posthog";

function installFakeClient(): void {
  setPostHogClientForTest({
    capture: (name: string, props?: Record<string, string>) => {
      if (mocks.phThrows) throw new Error("posthog exploded");
      mocks.phEvents.push({ name, props });
    },
    identify: vi.fn(),
    reset: vi.fn(),
  } as never);
}

beforeEach(() => {
  mocks.afEvents = [];
  mocks.phEvents = [];
  mocks.phThrows = false;
  mocks.store.clear();
  resetFunnelSessionGuardsForTest();
  resetPostHogInitForTest();
  installFakeClient();
});

describe("the fan-out reaches every destination", () => {
  it("sends the same event name and properties to both", () => {
    logOnboardingStep("aboutYou", 22);

    expect(mocks.afEvents).toEqual([
      { name: "onboarding_step", values: { step: "aboutYou", index: "22" } },
    ]);
    // Byte-identical, not merely present: cross-tool comparison is the point.
    expect(mocks.phEvents).toEqual([
      { name: "onboarding_step", props: { step: "aboutYou", index: "22" } },
    ]);
  });

  it("does not rename events between destinations", () => {
    logPurchaseStarted("control", "annual");
    expect(mocks.afEvents[0]!.name).toBe("purchase_started");
    expect(mocks.phEvents[0]!.name).toBe("purchase_started");
    expect(mocks.phEvents[0]!.props).toEqual(mocks.afEvents[0]!.values);
  });

  it("still reaches the once-per-install path", async () => {
    logOnboardingStarted();
    await vi.waitFor(() => expect(mocks.afEvents).toHaveLength(1));
    expect(mocks.phEvents[0]!.name).toBe("onboarding_started");
  });
});

describe("a broken PostHog cannot break anything else", () => {
  it("leaves the AppsFlyer send intact when capture throws", () => {
    mocks.phThrows = true;

    expect(() => logOnboardingStep("medication", 10)).not.toThrow();

    expect(mocks.afEvents).toEqual([
      { name: "onboarding_step", values: { step: "medication", index: "10" } },
    ]);
    expect(mocks.phEvents).toHaveLength(0);
  });

  it("does not consume the once-per-install token when capture throws", async () => {
    mocks.phThrows = true;

    logOnboardingStarted();
    await vi.waitFor(() => expect(mocks.afEvents).toHaveLength(1));

    // The AsyncStorage guard must still have been written off the AppsFlyer
    // result. If a PostHog throw had propagated, logOncePerInstall's catch
    // would have swallowed it BEFORE setItem — and onboarding_started would
    // re-fire on the next launch, corrupting the install funnel forever.
    expect([...mocks.store.keys()]).toEqual(["pepta:funnel:onboarding_started"]);
  });

  it("is a no-op, not a crash, when PostHog never initialised", () => {
    setPostHogClientForTest(null);

    expect(() => logOnboardingStep("welcome", 1)).not.toThrow();
    expect(mocks.afEvents).toHaveLength(1);
    expect(mocks.phEvents).toHaveLength(0);
  });
});
