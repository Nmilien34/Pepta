// Consent moved off its own onboarding turn and onto the welcome CTA, so the
// legal links must stay live here (coverage inherited from the deleted
// PrivacyScreen test) and the disclosure must sit next to the button that
// constitutes agreement.

import React from "react";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WelcomeScreen } from "./WelcomeScreen";

const mocks = vi.hoisted(() => ({
  openURL: vi.fn(() => Promise.resolve()),
  onContinue: vi.fn(),
  onSignIn: vi.fn(),
}));

vi.mock("react-native", () => ({
  Linking: { openURL: mocks.openURL },
  Platform: { OS: "ios" },
  Pressable: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
  }) => React.createElement("Pressable", props, children),
  StyleSheet: { create: (styles: unknown) => styles },
  Text: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Text", props, children),
  View: "View",
}));

vi.mock("expo-haptics", () => ({
  notificationAsync: vi.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: "success" },
}));

vi.mock("../../config", () => ({
  PRIVACY_URL: "https://pepta.test/privacy",
  TERMS_URL: "https://pepta.test/terms",
}));

vi.mock("../../theme/typography", () => ({
  typography: { fonts: { medium: "m", semiBold: "sb", bold: "b", heavy: "h" } },
}));

// The scaffold renders the footer (where consent + CTAs live).
vi.mock("../../components", () => ({
  ConvoScreen: ({
    children,
    footer,
  }: {
    children?: React.ReactNode;
    footer?: React.ReactNode;
  }) => React.createElement("View", null, children, footer),
  ConvoButton: ({ label, onPress }: { label: string; onPress?: () => void }) =>
    React.createElement("ConvoButton", { accessibilityLabel: label, onPress }, label),
  CitedStat: () => React.createElement("CitedStat"),
  convo: { ink: "#111", soft: "#555", faint: "#999", ground: "#fff" },
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

function allText(node: ReactTestInstance): string {
  return node.children
    .map((child) =>
      typeof child === "string" ? child : allText(child as ReactTestInstance),
    )
    .join("");
}

describe("WelcomeScreen inline consent", () => {
  beforeEach(() => {
    mocks.openURL.mockClear();
    mocks.onContinue.mockClear();
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

  it('states "by continuing you agree" beside the entry CTA', async () => {
    const tree = await render();
    const text = allText(tree.root);
    expect(text).toContain("By continuing you agree");
    expect(text).toContain("I’m ready");
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
      tree.root.findByProps({ accessibilityLabel: "I’m ready" }).props.onPress();
    });
    expect(mocks.onContinue).toHaveBeenCalledTimes(1);
  });
});
