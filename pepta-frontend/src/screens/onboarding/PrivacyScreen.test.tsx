import React from "react";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacyScreen } from "./PrivacyScreen";

const mocks = vi.hoisted(() => ({
  onAccept: vi.fn(),
  openURL: vi.fn(() => Promise.resolve()),
}));

vi.mock("react-native", () => ({
  Linking: {
    openURL: mocks.openURL,
  },
  Pressable: ({
    children,
    ...props
  }: {
    children?:
      | React.ReactNode
      | ((state: { pressed: boolean }) => React.ReactNode);
  }) =>
    React.createElement(
      "Pressable",
      props,
      typeof children === "function" ? children({ pressed: false }) : children,
    ),
  Text: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Text", props, children),
  View: "View",
}));

vi.mock("../../config", () => ({
  PRIVACY_URL: "https://pepta.test/privacy",
  TERMS_URL: "https://pepta.test/terms",
}));

vi.mock("../../theme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#8B5CF6",
      surface: "#fff",
      surfaceAlt: "#f4f4f5",
      textSecondary: "#666",
      textTertiary: "#999",
    },
    spacing: {
      sm: 8,
      md: 12,
      lg: 16,
    },
  }),
}));

vi.mock("../../components", () => ({
  AppText: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Text", props, children),
  Button: ({ label, onPress }: { label: string; onPress?: () => void }) =>
    React.createElement(
      "Pressable",
      { accessibilityRole: "button", accessibilityLabel: label, onPress },
      label,
    ),
  Mascot: "Mascot",
  OnboardingScaffold: ({
    children,
    footer,
  }: {
    children?: React.ReactNode;
    footer?: React.ReactNode;
  }) => React.createElement("View", null, children, footer),
}));

vi.mock("../../components/Icon", () => ({
  Icon: "Icon",
}));

function linkRow(
  root: TestRenderer.ReactTestRenderer["root"],
  label: string,
): ReactTestInstance {
  const match = root
    .findAll(
      (node) =>
        (node.type as unknown) === "Pressable" &&
        node.props.accessibilityRole === "link" &&
        node.props.accessibilityLabel === label &&
        typeof node.props.onPress === "function",
    )
    .at(0);
  if (!match) throw new Error(`No legal link row named "${label}"`);
  return match;
}

describe("PrivacyScreen legal review links", () => {
  beforeEach(() => {
    mocks.onAccept.mockClear();
    mocks.openURL.mockClear();
  });

  it("opens the backend terms and privacy pages from onboarding", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <PrivacyScreen progress={0.1} onAccept={mocks.onAccept} />,
      );
    });

    await act(async () => {
      linkRow(tree!.root, "Terms of Service").props.onPress();
    });

    await act(async () => {
      linkRow(tree!.root, "Privacy Policy").props.onPress();
    });

    expect(mocks.openURL).toHaveBeenNthCalledWith(
      1,
      "https://pepta.test/terms",
    );
    expect(mocks.openURL).toHaveBeenNthCalledWith(
      2,
      "https://pepta.test/privacy",
    );
  });
});
