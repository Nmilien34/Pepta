// The no-paywall-flash matrix: every access state maps to exactly one
// surface, and the paywall renders ONLY for a positively-resolved inactive.

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessDecision } from "@pepta/shared";
import { AccessGate } from "./AccessGate";

const mocks = vi.hoisted(() => ({
  auth: {
    isLoading: false,
    isAuthenticated: true,
    user: { onboardingComplete: true } as { onboardingComplete?: boolean } | null,
    logout: vi.fn(),
  },
  access: {
    decision: null as AccessDecision | null,
    resolving: false,
    resolve: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("react-native", () => ({ View: "View" }));
vi.mock("@react-navigation/native", () => ({
  NavigationContainer: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("NavigationContainer", null, children),
}));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => mocks.auth,
}));
vi.mock("../context/AccessContext", () => ({
  useAccess: () => mocks.access,
}));
vi.mock("../theme", () => ({
  useTheme: () => ({ colors: { bg: "#fff" } }),
}));
vi.mock("../navigation/MainTabs", () => ({ MainTabs: () => React.createElement("MainTabs") }));
vi.mock("../screens/onboarding/OnboardingNavigator", () => ({
  OnboardingNavigator: () => React.createElement("OnboardingNavigator"),
}));
vi.mock("../screens/onboarding/PaywallScreen", () => ({
  PaywallScreen: () => React.createElement("PaywallScreen"),
}));
vi.mock("../screens/access/AccessSetupScreen", () => ({
  AccessSetupScreen: ({ mode }: { mode: string }) =>
    React.createElement("AccessSetupScreen", { mode }),
}));

const ACTIVE: AccessDecision = {
  state: "active",
  source: "promotional",
  sources: [{ kind: "promotional", expiresAt: "2026-10-21T00:00:00.000Z", willRenew: false }],
  expiresAt: "2026-10-21T00:00:00.000Z",
  willRenew: false,
  lastVerifiedAt: "2026-07-22T00:00:00.000Z",
};

function render() {
  let tree: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    tree = TestRenderer.create(<AccessGate />);
  });
  return tree!;
}

function surface(tree: TestRenderer.ReactTestRenderer): string {
  const names = ["MainTabs", "OnboardingNavigator", "PaywallScreen", "AccessSetupScreen", "View"];
  for (const name of names) {
    if (tree.root.findAll((n) => String(n.type) === name).length > 0) return name;
  }
  return "none";
}

describe("AccessGate", () => {
  beforeEach(() => {
    mocks.auth.isLoading = false;
    mocks.auth.isAuthenticated = true;
    mocks.auth.user = { onboardingComplete: true };
    mocks.access.decision = null;
  });

  it("holds a blank frame while undecided — never a paywall flash", () => {
    mocks.access.decision = null;
    expect(surface(render())).toBe("View");
  });

  it("routes unauthenticated users to the funnel", () => {
    mocks.auth.isAuthenticated = false;
    expect(surface(render())).toBe("OnboardingNavigator");
  });

  it("active + onboarded → main app", () => {
    mocks.access.decision = ACTIVE;
    expect(surface(render())).toBe("MainTabs");
  });

  it("active + not onboarded → funnel (which now skips referral/paywall)", () => {
    mocks.auth.user = { onboardingComplete: false };
    mocks.access.decision = ACTIVE;
    expect(surface(render())).toBe("OnboardingNavigator");
  });

  it("provisioning → setup screen, not paywall", () => {
    mocks.access.decision = { state: "provisioning", retryAfterMs: 2000 };
    const tree = render();
    expect(surface(tree)).toBe("AccessSetupScreen");
    expect(tree.root.findByType("AccessSetupScreen" as never).props.mode).toBe("provisioning");
  });

  it("identity verification → setup screen in identity mode", () => {
    mocks.access.decision = {
      state: "identity_verification_required",
      provider: "google",
      reason: "invited_email_requires_verified_google",
    };
    const tree = render();
    expect(tree.root.findByType("AccessSetupScreen" as never).props.mode).toBe(
      "identity_verification",
    );
  });

  it("unavailable with bounded cached access → main app (offline mode)", () => {
    mocks.access.decision = {
      state: "temporarily_unavailable",
      retryAfterMs: 5000,
      cachedAccess: {
        source: "promotional",
        sources: ACTIVE.sources,
        validUntil: "2026-10-21T00:00:00.000Z",
        willRenew: false,
        lastVerifiedAt: "2026-07-22T00:00:00.000Z",
      },
    };
    expect(surface(render())).toBe("MainTabs");
  });

  it("unavailable without cache → retry screen, never paywall", () => {
    mocks.access.decision = { state: "temporarily_unavailable", retryAfterMs: 5000 };
    expect(surface(render())).toBe("AccessSetupScreen");
  });

  it("positively-resolved inactive returning user → subscription gate", () => {
    mocks.access.decision = {
      state: "inactive",
      reason: "expired",
      lastVerifiedAt: "2026-07-22T00:00:00.000Z",
    };
    expect(surface(render())).toBe("PaywallScreen");
  });

  it("positively-resolved inactive NEW user → normal funnel", () => {
    mocks.auth.user = { onboardingComplete: false };
    mocks.access.decision = {
      state: "inactive",
      reason: "never_entitled",
      lastVerifiedAt: "2026-07-22T00:00:00.000Z",
    };
    expect(surface(render())).toBe("OnboardingNavigator");
  });
});
