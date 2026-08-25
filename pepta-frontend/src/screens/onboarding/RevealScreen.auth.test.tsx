// The merged reveal+auth turn (2026-07-29): the standalone auth screen is
// gone, and signing in from the reveal IS claiming the plan. These tests pin
// the two variants and the resume path for drafts saved at the old step.

import React from "react";
import { all } from "../../tests/byLabel";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logRevealClaimTapped: vi.fn(),
  auth: {
    busy: null as string | null,
    error: null as string | null,
    showApple: true,
    handleApple: vi.fn(async () => undefined),
    handleGoogle: vi.fn(async () => undefined),
    setBusy: vi.fn(),
    setError: vi.fn(),
  },
}));

vi.mock("react-native", () => {
  class Value {
    constructor(public value: number) {}
    interpolate() {
      return 0;
    }
    setValue() {}
  }
  const finished = {
    start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }),
    stop: () => undefined,
  };
  return {
    Animated: {
      Value,
      View: "Animated.View",
      Text: "Animated.Text",
      timing: vi.fn(() => finished),
      spring: vi.fn(() => finished),
      sequence: vi.fn(() => finished),
      delay: vi.fn(() => finished),
      parallel: vi.fn(() => finished),
      stagger: vi.fn(() => finished),
      loop: vi.fn(() => ({ start: () => undefined, stop: () => undefined })),
      createAnimatedComponent: (c: unknown) => c,
    },
    Easing: { inOut: (v: unknown) => v, out: (v: unknown) => v, quad: "quad", cubic: "cubic", bezier: () => "bezier" },
    Platform: { OS: "ios" },
    StyleSheet: { create: (s: unknown) => s, absoluteFill: {} },
    Linking: { openURL: vi.fn(async () => undefined) },
    Modal: ({ children, visible, ...p }: { children?: React.ReactNode; visible?: boolean }) =>
      visible ? React.createElement("Modal", p, children) : null,
    Pressable: ({ children, ...p }: { children?: React.ReactNode }) =>
      React.createElement("Pressable", p, children),
    Text: ({ children, ...p }: { children?: React.ReactNode }) =>
      React.createElement("Text", p, children),
    View: ({ children, ...p }: { children?: React.ReactNode }) =>
      React.createElement("View", p, children),
  };
});
vi.mock("react-native-svg", () => ({
  default: "Svg",
  Circle: "Circle",
  Defs: "Defs",
  LinearGradient: "LinearGradient",
  Path: "Path",
  Stop: "Stop",
}));
vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn(() => Promise.resolve()),
  notificationAsync: vi.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Soft: "s", Light: "l", Medium: "m", Rigid: "r", Heavy: "h" },
  NotificationFeedbackType: { Success: "success" },
}));
vi.mock("expo-apple-authentication", () => ({
  AppleAuthenticationButton: (p: Record<string, unknown>) =>
    React.createElement("AppleAuthenticationButton", p),
  AppleAuthenticationButtonType: { CONTINUE: "continue" },
  AppleAuthenticationButtonStyle: { BLACK: "black" },
}));
vi.mock("../../components", () => ({
  Confetti: () => React.createElement("Confetti"),
  ConvoButton: ({ label, onPress }: { label: string; onPress?: () => void }) =>
    React.createElement("ConvoButton", { accessibilityLabel: label, onPress }, label),
  ConvoScreen: ({
    children,
    footer,
    onTyped,
  }: {
    children?: React.ReactNode;
    footer?: React.ReactNode;
    onTyped?: () => void;
  }) => {
    onTyped?.();
    return React.createElement("View", null, children, footer);
  },
  convo: { ground: "#fff", ink: "#111", soft: "#555", faint: "#999", surface: "#fff", hairline: "#eee", primary: "#7C5CFC" },
}));
vi.mock("../auth/SignInScreen", () => ({
  ProviderButton: ({ label, onPress }: { label: string; onPress?: () => void }) =>
    React.createElement("ProviderButton", { accessibilityLabel: label, onPress }, label),
}));
vi.mock("../auth/useProviderSignIn", () => ({
  useProviderSignIn: () => mocks.auth,
}));
vi.mock("../../theme/typography", () => ({
  typography: { fonts: { medium: "m", semiBold: "sb", bold: "b", heavy: "h" } },
}));
vi.mock("../../config", () => ({
  TERMS_URL: "https://example.test/terms",
  PRIVACY_URL: "https://example.test/privacy",
}));
vi.mock("../../services/funnelEvents", () => ({
  logRevealClaimTapped: mocks.logRevealClaimTapped,
}));

// The scored payoff reaches expo-modules-core through CountUp, which this
// file's react-native mock does not cover. These tests are about the auth
// gate, so the card is stubbed rather than the mock widened.
vi.mock("../../components/onboarding/RiskPayoff", () => ({
  RiskPayoff: () => null,
}));

import { RevealScreen } from "./RevealScreen";
import { migrateLegacyStep, parseDraft, serializeDraft } from "./onboardingDraft";
import { ONBOARDING_STEPS } from "./onboardingFlow";

function nodeText(node: ReactTestInstance): string {
  return node.children
    .map((c) => (typeof c === "string" ? c : nodeText(c as ReactTestInstance)))
    .join("");
}

async function mount(authenticated: boolean) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <RevealScreen
        risk={RISK}
      progress={0.95}
        startWeight={226}
        goalWeight={185}
        unit="lb"
        targets={{ proteinG: 154, calories: 1800, waterOz: 94, fiberG: 30, steps: 8000 }}
        projection={{ weeklyLoss: 1.5, weeks: null, estimatedDate: null }}
        authenticated={authenticated}
        onContinue={vi.fn()}
      />,
    );
  });
  return tree;
}

import { beforeEach } from "vitest";
beforeEach(() => {
  mocks.logRevealClaimTapped.mockClear();
});

// The scored payoff is now the reveal's card. These tests are about the auth
// gate, so a fixed profile keeps them independent of the risk model's tuning.
const RISK = {
  score: 48,
  drivers: [
    { key: 'pace' as const, label: 'Pace you picked', score: 52 },
    { key: 'training' as const, label: 'Resistance training', score: 45 },
    { key: 'age' as const, label: 'Age', score: 40 },
    { key: 'activity' as const, label: 'Daily movement', score: 58 },
  ],
};

describe("the payoff-first reveal (Start today for everyone, auth in a sheet)", () => {
  it("signed out: payoff CTA renders, NO auth block until the claim tap", async () => {
    const tree = await mount(false);
    // The payoff lands unconditionally — one Start today button, no identity
    // ask anywhere on the screen itself.
    expect(
      all(tree, "Start today", "ConvoButton"),
    ).toHaveLength(1);
    expect(nodeText(tree.root)).not.toContain("Save your plan");
    expect(tree.root.findAll((n) => String(n.type) === "ProviderButton")).toHaveLength(0);
  });

  it("signed out: the claim tap logs the funnel event and raises the save sheet", async () => {
    const tree = await mount(false);
    const cta = all(tree, "Start today", "ConvoButton")[0]!;
    await act(async () => {
      cta.props.onPress();
    });
    expect(mocks.logRevealClaimTapped).toHaveBeenCalledTimes(1);
    const text = nodeText(tree.root);
    expect(text).toContain("Save your plan");
    expect(text).toContain("Your plan is private to you.");
    expect(
      all(tree, "Continue with Google", "ProviderButton"),
    ).toHaveLength(1);
    expect(tree.root.findAll((n) => String(n.type) === "AppleAuthenticationButton")).toHaveLength(1);
    expect(text).toContain("Terms");
    expect(text).toContain("Privacy Policy");
  });

  it("dismissing the sheet returns to the plan with the button still there", async () => {
    const tree = await mount(false);
    const cta = all(tree, "Start today", "ConvoButton")[0]!;
    await act(async () => {
      cta.props.onPress();
    });
    const backdrop = all(tree, "Close", "Pressable")[0]!;
    await act(async () => {
      backdrop.props.onPress();
    });
    expect(nodeText(tree.root)).not.toContain("Save your plan");
    expect(
      all(tree, "Start today", "ConvoButton"),
    ).toHaveLength(1);
  });

  it("signed in: Start today advances directly, no sheet, no claim event", async () => {
    const onContinue = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <RevealScreen
          risk={RISK}
      progress={0.95}
          startWeight={226}
          goalWeight={185}
          unit="lb"
          targets={{ proteinG: 154, calories: 1800, waterOz: 94, fiberG: 30, steps: 8000 }}
          projection={{ weeklyLoss: 1.5, weeks: null, estimatedDate: null }}
          authenticated
          onContinue={onContinue}
        />,
      );
    });
    const cta = all(tree, "Start today", "ConvoButton")[0]!;
    await act(async () => {
      cta.props.onPress();
    });
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(mocks.logRevealClaimTapped).not.toHaveBeenCalled();
    expect(nodeText(tree.root)).not.toContain("Save your plan");
  });

  it("surfaces the sign-in error inline in the sheet, never as a navigation", async () => {
    mocks.auth.error = "We couldn’t sign you in with Google. Please try again.";
    const tree = await mount(false);
    const cta = all(tree, "Start today", "ConvoButton")[0]!;
    await act(async () => {
      cta.props.onPress();
    });
    expect(nodeText(tree.root)).toContain("couldn’t sign you in");
    mocks.auth.error = null;
  });
});

describe("drafts saved at the removed auth step", () => {
  it("resume at the merged reveal instead of restarting the quiz", () => {
    const draft = parseDraft(serializeDraft("auth", { goalType: "lose_fat" }));
    expect(draft).not.toBeNull();
    const migrated = migrateLegacyStep(draft!.step);
    expect(migrated).toBe("reveal");
    expect((ONBOARDING_STEPS as readonly string[]).includes(migrated)).toBe(true);
  });

  it("passes current steps through untouched", () => {
    for (const step of ["reveal", "paywall", "welcome"]) {
      expect(migrateLegacyStep(step)).toBe(step);
    }
  });
});
