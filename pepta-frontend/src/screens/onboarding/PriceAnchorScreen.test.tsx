// The price anchor.
//
// dailyEquivalent's arithmetic is covered in paywallPricing.test.ts. What only
// this file can pin is the rule that makes the screen safe to ship: it shows a
// price or it shows nothing. A screen that fell back to a hardcoded "16¢" when
// the product failed to load would be making a false price claim, and it would
// look completely correct in every screenshot.

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ packages: null as unknown, skipped: 0 }));

vi.mock("react-native", () => ({
  StyleSheet: { create: (s: Record<string, unknown>) => s },
  Text: "Text",
  View: "View",
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("react-native-svg", () => ({ default: "Svg", Path: "Path" }));
vi.mock("../../components", () => ({
  ConvoButton: ({ label }: { label: string }) => React.createElement("ConvoButton", { label }),
  ConvoProgressHeader: () => React.createElement("ConvoProgressHeader"),
}));
vi.mock("../../components/onboarding/CitedStat", () => ({
  CitedStat: (p: Record<string, unknown>) => React.createElement("CitedStat", p),
}));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("../../services/revenueCat", () => ({
  revenueCat: { getPaywallPackages: () => Promise.resolve(mocks.packages) },
}));

import { PriceAnchorScreen } from "./PriceAnchorScreen";

const yearlyAt = (price: number) => ({
  yearly: { product: { price, priceString: `$${price.toFixed(2)}` } },
});

async function render() {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <PriceAnchorScreen
        progress={0.95}
        onContinue={() => {}}
        onSkip={() => {
          mocks.skipped += 1;
        }}
      />,
    );
  });
  return tree;
}

// Flattens array children: the anchor renders `{perDay}` beside a nested
// <Text>, so that node's children is ["16¢", <Text/>] rather than a string.
const texts = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAll((n) => String(n.type) === "Text")
    .flatMap((n) => [n.props.children].flat())
    .filter((c): c is string => typeof c === "string");

beforeEach(() => {
  mocks.packages = null;
  mocks.skipped = 0;
});

describe("the anchor comes from the live price", () => {
  it("shows 16¢ for a $59.99 year", async () => {
    mocks.packages = yearlyAt(59.99);

    expect(texts(await render())).toContain("16¢");
  });

  it("follows the price when it changes, rather than staying at 16", async () => {
    // The failure this prevents: a baked-in "16" that survives a price rise in
    // App Store Connect and becomes a false claim nobody notices.
    mocks.packages = yearlyAt(119.99);
    const shown = texts(await render());

    expect(shown).toContain("32¢");
    expect(shown).not.toContain("16¢");
  });
});

describe("no price, no screen", () => {
  it("skips rather than inventing an anchor when the product will not load", async () => {
    mocks.packages = null;
    const tree = await render();

    expect(mocks.skipped).toBe(1);
    expect(texts(tree).join(" ")).not.toMatch(/¢|\$/);
  });

  it("skips a free or zero-priced product instead of anchoring on 0", async () => {
    mocks.packages = yearlyAt(0);
    await render();

    expect(mocks.skipped).toBe(1);
  });
});

describe("what it says once it has a number", () => {
  it("pairs the price with what the price protects", async () => {
    mocks.packages = yearlyAt(59.99);
    const tree = await render();

    expect(texts(tree).join(" ")).toMatch(/is what the year costs/);
    // The 39% is the second half of the argument, not decoration.
    const stat = tree.root.findAll((n) => String(n.type) === "CitedStat")[0]!;
    expect(stat.props.value).toBe("39%");
    expect(stat.props.cite).toMatch(/STEP-1/);
    expect(texts(tree)).toContain("No payment due now");
  });
});
