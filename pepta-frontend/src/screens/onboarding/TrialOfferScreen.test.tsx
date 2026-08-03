// The warm-up's trial gate: screen A resolves the LIVE offering and either
// plays the gift beat with the real duration, or silently skips the whole
// warm-up. The control arm of expa9f87848e1 must never see "free days"
// screens its wall won't honor — and no failure may ever block the funnel.

import React from "react";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPaywallPackages: vi.fn<() => Promise<unknown>>(),
  user: { id: "user_1" } as { id: string } | null,
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
      View: ({ children, ...p }: { children?: React.ReactNode }) =>
        React.createElement("Animated.View", p, children),
      Text: ({ children, ...p }: { children?: React.ReactNode }) =>
        React.createElement("Animated.Text", p, children),
      timing: vi.fn(() => finished),
      spring: vi.fn(() => finished),
      sequence: vi.fn(() => finished),
      delay: vi.fn(() => finished),
      parallel: vi.fn(() => finished),
      loop: vi.fn(() => ({ start: () => undefined, stop: () => undefined })),
      event: vi.fn(() => vi.fn()),
      createAnimatedComponent: (c: unknown) => c,
    },
    Easing: { inOut: (v: unknown) => v, quad: "quad", bezier: () => "bezier" },
    Platform: { OS: "ios" },
    StatusBar: "StatusBar",
    StyleSheet: { create: (s: unknown) => s, absoluteFill: {} },
    ScrollView: ({ children, ...p }: { children?: React.ReactNode }) =>
      React.createElement("ScrollView", p, children),
    Text: ({ children, ...p }: { children?: React.ReactNode }) =>
      React.createElement("Text", p, children),
    View: ({ children, ...p }: { children?: React.ReactNode }) =>
      React.createElement("View", p, children),
    Pressable: ({ children, ...p }: { children?: React.ReactNode }) =>
      React.createElement("Pressable", p, children),
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
});
vi.mock("react-native-svg", () => ({
  default: "Svg",
  Circle: "Circle",
  Defs: "Defs",
  Ellipse: "Ellipse",
  G: "G",
  Line: "Line",
  LinearGradient: "LinearGradient",
  Path: "Path",
  Rect: "Rect",
  Stop: "Stop",
  Text: "SvgText",
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children, ...p }: { children?: React.ReactNode }) =>
    React.createElement("SafeAreaView", p, children),
}));
vi.mock("../../components", () => ({
  ConvoButton: ({ label, onPress }: { label: string; onPress?: () => void }) =>
    React.createElement("ConvoButton", { accessibilityLabel: label, onPress }, label),
  ConvoGround: () => React.createElement("ConvoGround"),
  ConvoProgressHeader: ({ progress }: { progress: number }) =>
    React.createElement("ConvoProgressHeader", { progress }),
  convo: {
    ground: "#FCFBFE",
    ink: "#17141F",
    soft: "#555",
    faint: "#999",
    primary: "#7C5CFC",
  },
}));
vi.mock("../../components/LivingMascot", () => ({
  LivingMascot: ({ pose }: { pose: string }) => React.createElement("LivingMascot", { pose }),
}));
vi.mock("../../components/Mascot", () => ({
  Mascot: ({ pose }: { pose: string }) => React.createElement("Mascot", { pose }),
}));
vi.mock("../../theme/typography", () => ({
  typography: { fonts: { medium: "m", semiBold: "sb", bold: "b", heavy: "h" } },
}));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user }),
}));
vi.mock("../../services/revenueCat", () => ({
  revenueCat: { getPaywallPackages: mocks.getPaywallPackages },
}));

import { TrialOfferScreen } from "./TrialOfferScreen";
import { TrialCarouselScreen } from "./TrialCarouselScreen";

function makePackages(options: {
  monthlyIntro?: object | null;
  yearlyIntro?: object | null;
  monthlyEligible?: boolean;
  yearlyEligible?: boolean;
}) {
  const {
    monthlyIntro = null,
    yearlyIntro = null,
    monthlyEligible = false,
    yearlyEligible = false,
  } = options;
  return {
    offeringId: "default",
    monthly: {
      product: { identifier: "m", price: 9.99, priceString: "$9.99", introPrice: monthlyIntro },
    },
    yearly: {
      product: { identifier: "y", price: 40, priceString: "$40.00", introPrice: yearlyIntro },
    },
    trial: {
      monthly: { eligible: monthlyEligible, rawStatus: monthlyEligible ? 2 : 1 },
      yearly: { eligible: yearlyEligible, rawStatus: yearlyEligible ? 2 : 1 },
    },
  };
}

function packagesWithTrial(eligible: boolean, intro: object | null) {
  return makePackages({ monthlyIntro: intro, monthlyEligible: eligible });
}

const TRIAL = { price: 0, periodNumberOfUnits: 3, periodUnit: "DAY" };

function nodeText(node: ReactTestInstance): string {
  return node.children
    .map((c) => (typeof c === "string" ? c : nodeText(c as ReactTestInstance)))
    .join("");
}

async function mount(onContinue = vi.fn(), onSkipToWall = vi.fn()) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <TrialOfferScreen
        progress={0.94}
        onContinue={onContinue}
        onSkipToWall={onSkipToWall}
      />,
    );
  });
  return { tree, onContinue, onSkipToWall };
}

beforeEach(() => {
  mocks.getPaywallPackages.mockReset();
  mocks.user = { id: "user_1" };
});

describe("TrialOfferScreen trial gate", () => {
  it("plays the gift beat with the REAL duration for an eligible trial", async () => {
    mocks.getPaywallPackages.mockResolvedValue(packagesWithTrial(true, TRIAL));
    const { tree, onSkipToWall } = await mount();
    const text = nodeText(tree.root);
    expect(text).toContain("3 days on us");
    expect(text).toContain("One last thing");
    expect(
      tree.root.findAll(
        (n) => String(n.type) === "ConvoButton" && n.props.accessibilityLabel === "See my free offer",
      ),
    ).toHaveLength(1);
    expect(tree.root.findAll((n) => String(n.type) === "LivingMascot" && n.props.pose === "gift")).toHaveLength(1);
    expect(onSkipToWall).not.toHaveBeenCalled();
  });

  it("derives the duration from the product — a 1-week intro says '1 week on us'", async () => {
    mocks.getPaywallPackages.mockResolvedValue(
      packagesWithTrial(true, { price: 0, periodNumberOfUnits: 1, periodUnit: "WEEK" }),
    );
    const { tree } = await mount();
    expect(nodeText(tree.root)).toContain("1 week on us");
  });

  it("control arm (no intro offer): skips the whole warm-up, renders nothing", async () => {
    mocks.getPaywallPackages.mockResolvedValue(packagesWithTrial(true, null));
    const { tree, onSkipToWall, onContinue } = await mount();
    expect(onSkipToWall).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
    expect(nodeText(tree.root)).not.toContain("on us");
  });

  it("ineligible user: no free-days promise, skip", async () => {
    mocks.getPaywallPackages.mockResolvedValue(packagesWithTrial(false, TRIAL));
    const { onSkipToWall } = await mount();
    expect(onSkipToWall).toHaveBeenCalledTimes(1);
  });

  it("offerings failure: fails toward the wall, never blocks the funnel", async () => {
    mocks.getPaywallPackages.mockRejectedValue(new Error("offline"));
    const { onSkipToWall } = await mount();
    expect(onSkipToWall).toHaveBeenCalledTimes(1);
  });

  it("trial on the ANNUAL product only: still warms up, announcing yearly's duration", async () => {
    mocks.getPaywallPackages.mockResolvedValue(
      makePackages({ yearlyIntro: TRIAL, yearlyEligible: true }),
    );
    const { tree, onSkipToWall } = await mount();
    expect(nodeText(tree.root)).toContain("3 days on us");
    expect(onSkipToWall).not.toHaveBeenCalled();
  });

  it("differing durations: announces the PRESELECTED plan's (yearly), never monthly's", async () => {
    mocks.getPaywallPackages.mockResolvedValue(
      makePackages({
        monthlyIntro: TRIAL, // 3 days
        yearlyIntro: { price: 0, periodNumberOfUnits: 1, periodUnit: "WEEK" },
        monthlyEligible: true,
        yearlyEligible: true,
      }),
    );
    const { tree } = await mount();
    const text = nodeText(tree.root);
    expect(text).toContain("1 week on us");
    expect(text).not.toContain("3 days on us");
  });

  it("yearly intro exists but user is ineligible for it: falls back to monthly's trial", async () => {
    mocks.getPaywallPackages.mockResolvedValue(
      makePackages({
        monthlyIntro: TRIAL,
        yearlyIntro: { price: 0, periodNumberOfUnits: 1, periodUnit: "WEEK" },
        monthlyEligible: true,
        yearlyEligible: false,
      }),
    );
    const { tree } = await mount();
    expect(nodeText(tree.root)).toContain("3 days on us");
  });

  it("no signed-in user (cannot happen post-reveal, but never dead-end): skip", async () => {
    mocks.user = null;
    const { onSkipToWall } = await mount();
    expect(onSkipToWall).toHaveBeenCalledTimes(1);
    expect(mocks.getPaywallPackages).not.toHaveBeenCalled();
  });
});

describe("TrialCarouselScreen", () => {
  it("renders all four value slides, the peeking Pep, and the persistent CTA", async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <TrialCarouselScreen progress={0.95} onContinue={vi.fn()} />,
      );
    });
    const text = nodeText(tree.root);
    expect(text).toContain("Never wonder when");
    expect(text).toContain("See the medicine working");
    expect(text).toContain("without losing your muscle");
    expect(text).toContain("Notice patterns in");
    expect(tree.root.findAll((n) => String(n.type) === "Mascot" && n.props.pose === "peek")).toHaveLength(1);
    // The same first-person yes as screen A, persistent under every slide.
    expect(
      tree.root.findAll(
        (n) => String(n.type) === "ConvoButton" && n.props.accessibilityLabel === "See my free offer",
      ),
    ).toHaveLength(1);
  });
});
