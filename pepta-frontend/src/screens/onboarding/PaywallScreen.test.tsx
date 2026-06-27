import React from "react";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaywallScreen } from "./PaywallScreen";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getPaywallPackages: vi.fn(() => Promise.resolve(null)),
  onComplete: vi.fn(() => Promise.resolve()),
  openURL: vi.fn(() => Promise.resolve()),
  purchasePlan: vi.fn(),
  restore: vi.fn(),
  updateCachedUser: vi.fn(),
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
  ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("ScrollView", props, children),
  StatusBar: "StatusBar",
  Text: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Text", props, children),
  View: "View",
}));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("SafeAreaView", props, children),
}));

vi.mock("../../config", () => ({
  PRIVACY_URL: "https://pepta.test/privacy",
  TERMS_URL: "https://pepta.test/terms",
}));

vi.mock("../../theme", () => ({
  useTheme: () => ({
    colors: {
      bg: "#fff",
      border: "#eee",
      danger: "#dc2626",
      fiber: "#1E8E40",
      primary: "#8B5CF6",
      surface: "#fff",
      textPrimary: "#111",
      textSecondary: "#666",
      textTertiary: "#999",
    },
    radii: { pill: 999 },
    sizes: { hitSlop: 10 },
    spacing: {
      xs: 4,
      sm: 8,
      lg: 16,
      xl: 24,
    },
  }),
}));

vi.mock("../../components", () => ({
  AppText: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Text", props, children),
  Button: ({
    disabled,
    label,
    onPress,
  }: {
    disabled?: boolean;
    label: string;
    onPress?: () => void;
  }) =>
    React.createElement(
      "Pressable",
      {
        accessibilityRole: "button",
        accessibilityLabel: label,
        disabled,
        onPress,
      },
      label,
    ),
  Mascot: "Mascot",
}));

vi.mock("../../components/Icon", () => ({
  Icon: "Icon",
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    updateCachedUser: mocks.updateCachedUser,
    user: {
      id: "u1",
      entitlement: { status: "free", expiresAt: null, willRenew: false },
    },
  }),
}));

vi.mock("../../services/api", () => ({
  api: {
    getCurrentUser: mocks.getCurrentUser,
  },
}));

vi.mock("../../services/revenueCat", () => ({
  isRevenueCatPurchaseCancelled: () => false,
  revenueCat: {
    getPaywallPackages: mocks.getPaywallPackages,
    purchasePlan: mocks.purchasePlan,
    restore: mocks.restore,
  },
}));

function nodeText(node: ReactTestInstance): string {
  return node.children
    .map((child) =>
      typeof child === "string" ? child : nodeText(child as ReactTestInstance),
    )
    .join("");
}

function textLink(
  root: TestRenderer.ReactTestRenderer["root"],
  label: string,
): ReactTestInstance {
  const match = root
    .findAll(
      (node) =>
        (node.type as unknown) === "Text" &&
        nodeText(node) === label &&
        typeof node.props.onPress === "function",
    )
    .at(0);
  if (!match) throw new Error(`No tappable text link named "${label}"`);
  return match;
}

describe("PaywallScreen legal links", () => {
  beforeEach(() => {
    mocks.getPaywallPackages.mockClear();
    mocks.onComplete.mockClear();
    mocks.openURL.mockClear();
  });

  it("opens terms and privacy from the trial review footer", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <PaywallScreen onComplete={mocks.onComplete} />,
      );
    });

    await act(async () => {
      await textLink(tree!.root, "Terms").props.onPress();
    });

    await act(async () => {
      await textLink(tree!.root, "Privacy").props.onPress();
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
