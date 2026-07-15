import React from "react";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaywallScreen } from "./PaywallScreen";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getPaywallPackages: vi.fn(),
  isPurchaseCancelled: vi.fn(() => false),
  onComplete: vi.fn(() => Promise.resolve()),
  openURL: vi.fn(() => Promise.resolve()),
  purchasePlan: vi.fn(),
  restore: vi.fn(),
  updateCachedUser: vi.fn(),
}));

const paywallPackages = {
  monthly: { product: { price: 9, priceString: "$9.00", currencyCode: "USD" } },
  yearly: { product: { price: 40, priceString: "$40.00", currencyCode: "USD" } },
};

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
  isRevenueCatPurchaseCancelled: mocks.isPurchaseCancelled,
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

function button(
  root: TestRenderer.ReactTestRenderer["root"],
  label: string,
): ReactTestInstance {
  const match = root
    .findAll(
      (node) =>
        (node.type as unknown) === "Pressable" &&
        node.props.accessibilityRole === "button" &&
        node.props.accessibilityLabel === label,
    )
    .at(0);
  if (!match) throw new Error(`No button named "${label}"`);
  return match;
}

function allText(root: TestRenderer.ReactTestRenderer["root"]): string {
  return root
    .findAll((node) => (node.type as unknown) === "Text")
    .map(nodeText)
    .join("\n");
}

describe("PaywallScreen legal links", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
    mocks.getPaywallPackages.mockClear();
    mocks.getPaywallPackages.mockResolvedValue(paywallPackages);
    mocks.isPurchaseCancelled.mockReset();
    mocks.isPurchaseCancelled.mockReturnValue(false);
    mocks.onComplete.mockClear();
    mocks.openURL.mockClear();
    mocks.purchasePlan.mockReset();
    mocks.restore.mockReset();
    mocks.updateCachedUser.mockClear();
  });

  it("opens terms and privacy from the subscription footer", async () => {
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

  it("renders a hard paywall without close bypass or trial copy", async () => {
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <PaywallScreen onComplete={mocks.onComplete} />,
      );
    });

    expect(
      tree!.root.findAll((node) => node.props.accessibilityLabel === "Close"),
    ).toHaveLength(0);
    expect(button(tree!.root, "Subscribe")).toBeTruthy();
    expect(allText(tree!.root).toLowerCase()).not.toContain("free trial");
    expect(allText(tree!.root).toLowerCase()).not.toContain("7 days free");
  });

  it("keeps subscribe disabled until App Store packages are loaded", async () => {
    mocks.getPaywallPackages.mockResolvedValueOnce(null);
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <PaywallScreen onComplete={mocks.onComplete} />,
      );
    });

    const subscribe = button(tree!.root, "Subscribe");
    expect(subscribe.props.disabled).toBe(true);
    expect(allText(tree!.root)).toContain("Loading App Store plans");

    await act(async () => {
      await subscribe.props.onPress?.();
    });

    expect(mocks.purchasePlan).not.toHaveBeenCalled();
  });

  it("keeps users on the paywall without an in-app retention offer after cancellation", async () => {
    mocks.isPurchaseCancelled.mockReturnValue(true);
    mocks.purchasePlan.mockRejectedValueOnce({ code: "USER_CANCELLED" });
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <PaywallScreen onComplete={mocks.onComplete} />,
      );
    });

    await act(async () => {
      await button(tree!.root, "Subscribe").props.onPress();
    });

    expect(mocks.purchasePlan).toHaveBeenCalledWith("u1", "yearly");
    expect(mocks.onComplete).not.toHaveBeenCalled();
    expect(allText(tree!.root)).not.toContain("Exclusive Offer");
    expect(allText(tree!.root)).not.toContain("$44.99");
  });

  it("does not complete onboarding until purchase entitlement is active", async () => {
    mocks.purchasePlan.mockResolvedValueOnce({
      customerInfo: {},
      entitlementActive: false,
    });
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <PaywallScreen onComplete={mocks.onComplete} />,
      );
    });

    await act(async () => {
      await button(tree!.root, "Subscribe").props.onPress();
    });

    expect(mocks.purchasePlan).toHaveBeenCalledWith("u1", "yearly");
    expect(mocks.onComplete).not.toHaveBeenCalled();
    expect(allText(tree!.root)).toContain("Purchase is still syncing");
  });

  it("keeps optimistic pro access if the backend refresh is still waiting on the RevenueCat webhook", async () => {
    mocks.purchasePlan.mockResolvedValueOnce({
      customerInfo: {},
      entitlementActive: true,
    });
    mocks.getCurrentUser.mockResolvedValueOnce({
      id: "u1",
      entitlement: { status: "free", expiresAt: null, willRenew: false },
    });
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <PaywallScreen onComplete={mocks.onComplete} />,
      );
    });

    await act(async () => {
      await button(tree!.root, "Subscribe").props.onPress();
    });

    expect(mocks.purchasePlan).toHaveBeenCalledWith("u1", "yearly");
    expect(mocks.onComplete).toHaveBeenCalledTimes(1);
    expect(mocks.updateCachedUser).toHaveBeenCalledWith(
      expect.objectContaining({
        entitlement: expect.objectContaining({
          status: "active",
          revenueCatCustomerId: "u1",
          revenueCatEntitlement: "pro",
        }),
      }),
    );
    expect(
      mocks.updateCachedUser.mock.calls.at(-1)?.[0].entitlement.status,
    ).toBe("active");
  });
});
