// Consent lives on the welcome CTA rather than its own onboarding turn, so
// the legal links must stay live here (coverage inherited from the deleted
// PrivacyScreen test) and the disclosure must sit next to the button that
// constitutes agreement.
//
// The screen became the carousel on 2026-08-17. What is guaranteed is
// unchanged: both legal links open, Get started enters the funnel, Sign in
// reaches the returning-user path — and, new, that NONE of it waits on an
// animation. The turn this replaced hid its footer for 2.14s.

import React from "react";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WelcomeScreen } from "./WelcomeScreen";

const mocks = vi.hoisted(() => ({
  openURL: vi.fn(() => Promise.resolve()),
  onContinue: vi.fn(),
  onSignIn: vi.fn(),
}));

vi.mock("react-native", () => {
  const Animated = {
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement("Animated.View", props, children),
    Value: class {
      interpolate() {
        return 0;
      }
    },
    timing: () => ({ start: vi.fn(), stop: vi.fn() }),
    sequence: () => ({ start: vi.fn(), stop: vi.fn() }),
    loop: () => ({ start: vi.fn(), stop: vi.fn() }),
  };
  return {
    Animated,
    Easing: { inOut: () => undefined, quad: undefined },
    Image: "Image",
    Linking: { openURL: mocks.openURL },
    Platform: { OS: "ios" },
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement("Pressable", props, children),
    StatusBar: "StatusBar",
    StyleSheet: {
      create: (styles: unknown) => styles,
      absoluteFill: {},
    },
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement("Text", props, children),
    View: "View",
  };
});

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("View", null, children),
}));

vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Medium: "m" },
}));

vi.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));

vi.mock("../../config", () => ({
  PRIVACY_URL: "https://pepta.test/privacy",
  TERMS_URL: "https://pepta.test/terms",
}));

vi.mock("../../theme/typography", () => ({
  typography: { fonts: { medium: "m", semiBold: "sb", bold: "b", heavy: "h", serif: "serif" } },
}));

vi.mock("../../components", () => ({
  ConvoGround: () => React.createElement("ConvoGround"),
  Mascot: () => React.createElement("Mascot"),
  convo: { ink: "#111", soft: "#555", faint: "#999", ground: "#fff", surface: "#fff", onPrimary: "#fff" },
}));

function link(
  root: TestRenderer.ReactTestRenderer["root"],
  label: string,
): ReactTestInstance {
  const match = root
    .findAll(
      (node) =>
        node.props.accessibilityRole === "link" &&
        node.props.accessibilityLabel === label &&
        typeof node.props.onPress === "function",
    )
    .at(0);
  if (!match) throw new Error(`No legal link named "${label}"`);
  return match;
}

function button(
  root: TestRenderer.ReactTestRenderer["root"],
  label: string,
): ReactTestInstance {
  const match = root
    .findAll(
      (node) =>
        node.props.accessibilityRole === "button" &&
        node.props.accessibilityLabel === label &&
        typeof node.props.onPress === "function",
    )
    .at(0);
  if (!match) throw new Error(`No button named "${label}"`);
  return match;
}

function allText(node: ReactTestInstance): string {
  return node.children
    .map((child) =>
      typeof child === "string" ? child : allText(child as ReactTestInstance),
    )
    .join("");
}

describe("WelcomeScreen", () => {
  beforeEach(() => {
    mocks.openURL.mockClear();
    mocks.onContinue.mockClear();
    mocks.onSignIn.mockClear();
  });

  async function render() {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <WelcomeScreen onContinue={mocks.onContinue} onSignIn={mocks.onSignIn} />,
      );
    });
    return tree!;
  }

  it("shows the promise, the CTA and the consent line on the first frame", async () => {
    const tree = await render();
    const text = allText(tree.root);
    // No typing gate: everything the user needs is present immediately.
    expect(text).toContain("Know exactly where you stand.");
    expect(text).toContain("Get started");
    expect(text).toContain("By continuing you agree");
    expect(text).toContain("Already have an account?");
  });

  it("opens the hosted Terms and Privacy pages from the disclosure", async () => {
    const tree = await render();

    await act(async () => {
      link(tree.root, "Terms of Service").props.onPress();
    });
    await act(async () => {
      link(tree.root, "Privacy Policy").props.onPress();
    });

    expect(mocks.openURL).toHaveBeenNthCalledWith(1, "https://pepta.test/terms");
    expect(mocks.openURL).toHaveBeenNthCalledWith(2, "https://pepta.test/privacy");
  });

  it("continues straight into the funnel — no consent gate in between", async () => {
    const tree = await render();
    await act(async () => {
      button(tree.root, "Get started").props.onPress();
    });
    expect(mocks.onContinue).toHaveBeenCalledTimes(1);
    expect(mocks.onSignIn).not.toHaveBeenCalled();
  });

  it("routes a returning user to sign in without entering onboarding", async () => {
    const tree = await render();
    await act(async () => {
      button(tree.root, "Sign in").props.onPress();
    });
    expect(mocks.onSignIn).toHaveBeenCalledTimes(1);
    expect(mocks.onContinue).not.toHaveBeenCalled();
  });

  it("renders all five carousel cards", async () => {
    const tree = await render();
    expect(tree.root.findAllByType("Image" as never)).toHaveLength(5);
  });
});
