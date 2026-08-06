import React from "react";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaywallScreen } from "./PaywallScreen";
import { clearPurchaseGrace, hasPurchaseGrace } from "../../services/purchaseGrace";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getPaywallPackages: vi.fn(),
  isPurchaseCancelled: vi.fn(() => false),
  logPaywallShown: vi.fn(),
  logPurchaseStarted: vi.fn(),
  onComplete: vi.fn(() => Promise.resolve()),
  openURL: vi.fn(() => Promise.resolve()),
  purchasePlan: vi.fn(),
  restore: vi.fn(),
  updateCachedUser: vi.fn(),
  appStateListeners: [] as Array<(state: string) => void>,
  logPaywallDismissed: vi.fn(),
}));

// Control arm: no introductory offer on the monthly product.
const paywallPackages = {
  monthly: { product: { price: 9.99, priceString: "$9.99", currencyCode: "USD" } },
  yearly: { product: { price: 40, priceString: "$40.00", currencyCode: "USD" } },
  offeringId: "default",
  trial: {
    monthly: { eligible: false, rawStatus: null },
    yearly: { eligible: false, rawStatus: null },
  },
};

// Treatment arm: monthly carries a 3-day free intro offer (derived, never
// hardcoded — the "3" here is fixture data, the copy must read it).
const trialPaywallPackages = {
  monthly: {
    product: {
      price: 9.99,
      priceString: "$9.99",
      currencyCode: "USD",
      introPrice: { price: 0, periodNumberOfUnits: 3, periodUnit: "DAY" },
    },
  },
  yearly: { product: { price: 40, priceString: "$40.00", currencyCode: "USD" } },
  offeringId: "trial-offer",
  trial: {
    monthly: { eligible: true, rawStatus: 2 },
    yearly: { eligible: false, rawStatus: null },
  },
};

// Both plans carry an eligible trial (the 1.0.5 rollout state), with
// DIFFERENT durations so per-package derivation is observable.
const bothTrialPaywallPackages = {
  monthly: {
    product: {
      price: 9.99,
      priceString: "$9.99",
      currencyCode: "USD",
      introPrice: { price: 0, periodNumberOfUnits: 3, periodUnit: "DAY" },
    },
  },
  yearly: {
    product: {
      price: 40,
      priceString: "$40.00",
      currencyCode: "USD",
      introPrice: { price: 0, periodNumberOfUnits: 1, periodUnit: "WEEK" },
    },
  },
  offeringId: "default",
  trial: {
    monthly: { eligible: true, rawStatus: 2 },
    yearly: { eligible: true, rawStatus: 2 },
  },
};

vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (_event: string, cb: (state: string) => void) => {
      mocks.appStateListeners.push(cb);
      return { remove: vi.fn() };
    },
  },
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
  StyleSheet: { create: (styles: unknown) => styles },
  Platform: { OS: "ios" },
  Easing: {
    bezier: () => "bezier",
    inOut: (v: unknown) => v,
    out: (v: unknown) => v,
    quad: "quad",
  },
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(false),
    addEventListener: () => ({ remove: () => undefined }),
  },
  Animated: {
    Value: class {
      constructor(public value: number) {}
      interpolate() {
        return 0;
      }
      setValue() {}
    },
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement("Animated.View", props, children),
    timing: () => ({ start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }), stop: () => undefined }),
    spring: () => ({ start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }), stop: () => undefined }),
    parallel: () => ({ start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }), stop: () => undefined }),
    sequence: () => ({ start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }), stop: () => undefined }),
    loop: () => ({ start: () => undefined, stop: () => undefined }),
    delay: () => ({ start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }), stop: () => undefined }),
  },
  Text: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("Text", props, children),
  View: "View",
}));

vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("SafeAreaView", props, children),
}));

vi.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement("LinearGradient", props, children),
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
  REVENUECAT_ENTITLEMENT_ID: "pro",
  isRevenueCatPurchaseCancelled: mocks.isPurchaseCancelled,
  revenueCat: {
    getPaywallPackages: mocks.getPaywallPackages,
    purchasePlan: mocks.purchasePlan,
    restore: mocks.restore,
  },
}));

vi.mock("../../services/funnelEvents", () => ({
  logPaywallShown: mocks.logPaywallShown,
  logPurchaseStarted: mocks.logPurchaseStarted,
  logPaywallOfferingDebug: vi.fn(),
  logPaywallDismissed: mocks.logPaywallDismissed,
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
    mocks.logPaywallShown.mockClear();
    mocks.logPaywallDismissed.mockClear();
    mocks.appStateListeners.length = 0;
    mocks.logPurchaseStarted.mockClear();
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
    expect(button(tree!.root, "Start my year — $40.00")).toBeTruthy();
    expect(allText(tree!.root).toLowerCase()).not.toContain("free trial");
    expect(allText(tree!.root).toLowerCase()).not.toContain("7 days free");

    // Yearly card: bold per-month anchor with the billed total right under it
    // (3.1.2(c) — the anchor must never render without the billed price).
    const text = allText(tree!.root);
    expect(text).toContain("$3.33");
    expect(text).toContain("$40.00/yr");
    expect(text).toContain("$40.00/year. Cancel anytime");
  });

  it("keeps subscribe disabled until App Store packages are loaded", async () => {
    mocks.getPaywallPackages.mockResolvedValueOnce(null);
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <PaywallScreen onComplete={mocks.onComplete} />,
      );
    });

    const subscribe = button(tree!.root, "Start my year — $59.99");
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
      await button(tree!.root, "Start my year — $40.00").props.onPress();
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
      await button(tree!.root, "Start my year — $40.00").props.onPress();
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
      await button(tree!.root, "Start my year — $40.00").props.onPress();
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
    // The SDK-confirmed purchase must open the access-gate grace window —
    // without it, AccessGate's stale/webhook-lagged 'inactive' bounces the
    // just-paid user back onto a paywall after welcomeIn (the rating bug).
    expect(hasPurchaseGrace()).toBe(true);
    clearPurchaseGrace();
  });

  it("derives trial CTA copy from the treatment offering's intro offer", async () => {
    mocks.getPaywallPackages.mockResolvedValue(trialPaywallPackages);
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <PaywallScreen onComplete={mocks.onComplete} />,
      );
    });

    // Yearly (default selection) has no trial — an honest purchase CTA.
    expect(button(tree!.root, "Start my year — $40.00")).toBeTruthy();

    // Select the monthly plan (second radio card).
    const monthlyRadio = tree!.root.findAll(
      (node) =>
        (node.type as unknown) === "Pressable" &&
        node.props.accessibilityRole === "radio",
    )[1]!;
    await act(async () => {
      monthlyRadio.props.onPress();
    });

    // Duration derives from the product; the post-trial price lives in the
    // trial-aware footer (v2 rev 5 — the subline is deliberately price-free).
    expect(button(tree!.root, "Try today for $0.00")).toBeTruthy();
    const text = allText(tree!.root);
    expect(text).toContain("3 days free — we'll remind you before it ends.");
    expect(text).toContain("Then $9.99/month, auto-renews. Cancel anytime");
    // The terms carousel replaced the reassure row for a trial plan.
    expect(text).toContain("Free today — full access");
  });

  it("fires paywall_shown once per presentation with the offering variant", async () => {
    mocks.getPaywallPackages.mockResolvedValue(trialPaywallPackages);
    let tree: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      tree = TestRenderer.create(
        <PaywallScreen onComplete={mocks.onComplete} />,
      );
    });
    // A re-render within the same presentation must not re-fire.
    await act(async () => {
      tree!.update(<PaywallScreen onComplete={mocks.onComplete} />);
    });

    expect(mocks.logPaywallShown).toHaveBeenCalledTimes(1);
    // Unambiguous semantics: trialCopyShown refers to the DEFAULT-SELECTED
    // plan (yearly, which has no trial in this fixture); trialCopyPlans names
    // where trial copy actually rendered.
    expect(mocks.logPaywallShown).toHaveBeenCalledWith("trial-offer", {
      defaultSelectedPlan: "yearly",
      trialCopyShown: false,
      trialCopyPlans: "monthly",
    });
  });

  it("with trials on BOTH plans, first render is the yearly trial — yearly values, not monthly's", async () => {
    mocks.getPaywallPackages.mockResolvedValue(bothTrialPaywallPackages);
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(<PaywallScreen onComplete={mocks.onComplete} />);
    });

    // Yearly preselected: free CTA immediately, with the YEARLY duration and
    // the YEARLY post-trial price (1 week / $40.00, never 3 days / $9.99).
    expect(button(tree!.root, "Try today for $0.00")).toBeTruthy();
    const text = allText(tree!.root);
    expect(text).toContain("1 week free — we'll remind you before it ends.");
    expect(text).toContain("Then $40.00/year, auto-renews. Cancel anytime");
    expect(text).not.toContain("Then $9.99/month");
    // Badge collision resolved: yearly slot carries its trial, SAVE moves to
    // the support line.
    expect(text).toContain("1 WEEK FREE");
    expect(text).toContain("once a year · save 67%");
    expect(mocks.logPaywallShown).toHaveBeenCalledWith("default", {
      defaultSelectedPlan: "yearly",
      trialCopyShown: true,
      trialCopyPlans: "both",
    });

    // Switching to monthly re-derives everything from monthly's own package.
    const monthlyRadio = tree!.root.findAll(
      (node) =>
        (node.type as unknown) === "Pressable" &&
        node.props.accessibilityRole === "radio",
    )[1]!;
    await act(async () => {
      monthlyRadio.props.onPress();
    });
    const monthlyText = allText(tree!.root);
    expect(monthlyText).toContain("3 days free — we'll remind you before it ends.");
    expect(monthlyText).toContain("Then $9.99/month, auto-renews. Cancel anytime");
  });

  it("fires paywall_dismissed once when the app is backgrounded without a purchase", async () => {
    mocks.getPaywallPackages.mockResolvedValue(trialPaywallPackages);
    await act(async () => {
      TestRenderer.create(<PaywallScreen onComplete={mocks.onComplete} />);
    });
    // The StoreKit sheet only drives 'inactive' — that must NOT count.
    await act(async () => {
      mocks.appStateListeners.forEach((cb) => cb("inactive"));
    });
    expect(mocks.logPaywallDismissed).not.toHaveBeenCalled();
    await act(async () => {
      mocks.appStateListeners.forEach((cb) => cb("background"));
      mocks.appStateListeners.forEach((cb) => cb("background"));
    });
    expect(mocks.logPaywallDismissed).toHaveBeenCalledTimes(1);
    expect(mocks.logPaywallDismissed).toHaveBeenCalledWith({
      variant: "trial-offer",
      selectedPlan: "yearly",
      trialCopyShown: false,
    });
  });

  it("fires purchase_started with variant and package before the store sheet", async () => {
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
      await button(tree!.root, "Start my year — $40.00").props.onPress();
    });

    expect(mocks.logPurchaseStarted).toHaveBeenCalledTimes(1);
    expect(mocks.logPurchaseStarted).toHaveBeenCalledWith("default", "annual");
    const purchaseOrder = mocks.purchasePlan.mock.invocationCallOrder[0]!;
    const eventOrder = mocks.logPurchaseStarted.mock.invocationCallOrder[0]!;
    expect(eventOrder).toBeLessThan(purchaseOrder);
  });
});
