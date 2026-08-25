// The trial timeline.
//
// The rows themselves are already covered by paywallTimeline.test.ts. What is
// only testable here is the part that is easy to get silently wrong: the rail
// between the nodes, which is a `flex: 1` child of a column that only has a
// height because its parent row stretches it. If that chain breaks the rail
// collapses to nothing and the screen still renders — three disconnected
// bubbles and no visible defect in code review.

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  packages: null as unknown,
  skipped: 0,
}));

vi.mock("react-native", () => ({
  StyleSheet: { create: (s: Record<string, unknown>) => s },
  Text: "Text",
  View: "View",
}));
vi.mock("react-native-svg", () => ({ default: "Svg", Path: "Path", Rect: "Rect" }));
vi.mock("../../components", () => ({
  ConvoScreen: ({ children, footer, question }: Record<string, unknown>) =>
    React.createElement("ConvoScreen", { question }, children as React.ReactNode, footer as React.ReactNode),
  ConvoButton: ({ label }: { label: string }) => React.createElement("ConvoButton", { label }),
}));
vi.mock("../../components/LivingMascot", () => ({
  LivingMascot: ({ pose }: { pose: string }) => React.createElement("LivingMascot", { pose }),
}));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("../../services/revenueCat", () => ({
  revenueCat: { getPaywallPackages: () => Promise.resolve(mocks.packages) },
}));

import { TrialTimelineScreen } from "./TrialTimelineScreen";

const trialPkg = (units: number, unit = "DAY") => ({
  product: {
    introPrice: { price: 0, periodNumberOfUnits: units, periodUnit: unit },
  },
});

function withTrial(units: number, yearlyPrice?: number) {
  mocks.packages = {
    yearly: yearlyPrice == null ? trialPkg(units) : pricedPkg(units, yearlyPrice),
    monthly: trialPkg(units),
    trial: { yearly: { eligible: true }, monthly: { eligible: true } },
  };
}

// A yearly package carrying a real price, so dailyEquivalent has something to
// divide. The bare trialPkg has only an introPrice and yields no anchor.
const pricedPkg = (units: number, price: number) => ({
  product: {
    price,
    priceString: `$${price.toFixed(2)}`,
    introPrice: { price: 0, periodNumberOfUnits: units, periodUnit: 'DAY' },
  },
});

async function render() {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <TrialTimelineScreen
        progress={0.93}
        onContinue={() => {}}
        onSkipToWall={() => {
          mocks.skipped += 1;
        }}
      />,
    );
  });
  return tree;
}

/** Every View carrying the rail's signature colour. */
function rails(tree: TestRenderer.ReactTestRenderer) {
  return tree.root.findAll(
    (n) =>
      String(n.type) === "View" &&
      Object.assign({}, ...[n.props.style].flat().filter(Boolean)).backgroundColor === "#EFE9FF",
  );
}

function texts(tree: TestRenderer.ReactTestRenderer) {
  return tree.root
    .findAll((n) => String(n.type) === "Text")
    .flatMap((n) => (typeof n.props.children === "string" ? [n.props.children] : []));
}

beforeEach(() => {
  mocks.packages = null;
  mocks.skipped = 0;
});

describe("the rail connects the nodes", () => {
  it("draws one fewer rail than there are rows", async () => {
    // Three beats, two gaps. A rail under the last node would run off into
    // nothing and make the list look truncated.
    withTrial(3);
    const tree = await render();

    expect(texts(tree)).toContain("TODAY");
    expect(rails(tree)).toHaveLength(2);
  });

  it("still leaves no trailing rail on a one-day trial, which has no reminder row", async () => {
    // buildTrialTimeline drops the reminder beat when there is no room for it,
    // so this path renders two rows — and must still stop the rail at the last.
    withTrial(1);
    const tree = await render();

    expect(texts(tree)).not.toContain("DAY 0");
    expect(rails(tree)).toHaveLength(1);
  });

  it("grows the rail rather than fixing its height", async () => {
    // `flex: 1` is what lets the rail span whatever the row's text makes it.
    // A hard height here would leave a gap under long copy and overshoot on
    // short copy, and neither shows up in a screenshot of one trial length.
    withTrial(3);
    const style = Object.assign(
      {},
      ...[rails(await render())[0]!.props.style].flat().filter(Boolean),
    );

    expect(style.flex).toBe(1);
    expect(style.height).toBeUndefined();
    expect(style.width).toBe(2.5);
    // Flush to the node above, clear of the node below.
    expect(style.marginTop).toBeUndefined();
    expect(style.marginBottom).toBe(2);
  });
});

describe("what the screen promises", () => {
  it("names the charge date and the reminder, not just 'free'", async () => {
    // The whole reason this screen exists: the dominant objection to a trial
    // is being billed silently.
    withTrial(3);
    const all = texts(await render()).join(" ");

    expect(all).toMatch(/We remind you/);
    expect(all).toMatch(/First charge/);
    expect(all).toMatch(/Cancel anytime before/);
    expect(all).toContain("No payment due now");
  });

  it("lets Pep make the reminder personal", async () => {
    withTrial(3);
    const tree = await render();

    expect(tree.root.findAll((n) => String(n.type) === "LivingMascot")).toHaveLength(1);
    expect(texts(tree).join(" ")).toMatch(/I’ll be the one who reminds you/);
  });
});

describe("no trial, no promises", () => {
  it("skips to the wall rather than showing dates that will not happen", async () => {
    // The control arm of expa9f87848e1 has no trial.
    mocks.packages = {
      yearly: {},
      monthly: {},
      trial: { yearly: { eligible: false }, monthly: { eligible: false } },
    };
    const tree = await render();

    expect(mocks.skipped).toBe(1);
    expect(rails(tree)).toHaveLength(0);
  });

  it("renders nothing at all until the real offer resolves", async () => {
    // A placeholder timeline would be a guess about when someone gets charged.
    mocks.packages = null;
    const tree = await render();

    expect(texts(tree)).toEqual([]);
  });
});

// texts() above only collects Text nodes whose children is a STRING, so it
// cannot see the anchor — that line interpolates {perDay}, making its children
// an array. Asserting with it would pass whether or not the line rendered.
function deepText(tree: TestRenderer.ReactTestRenderer): string {
  const walk = (c: unknown): string =>
    typeof c === 'string'
      ? c
      : Array.isArray(c)
        ? c.map(walk).join('')
        : '';
  return tree.root
    .findAll((n) => String(n.type) === 'Text')
    .map((n) => walk(n.props.children))
    .join(' ');
}

describe('the folded price anchor', () => {
  // Was its own screen between here and the wall until 2026-08-25. It rides
  // the CHARGE row specifically: that is the only line before the paywall
  // that raises the question of money at all.
  it('reframes the year on the charge row, floored to the cent', async () => {
    withTrial(3, 59.99);
    const all = deepText(await render());
    // 59.99 / 365 = 0.16435… → floored to 16c, never rounded up to 17.
    expect(all).toContain('16\u00A2 a day');
    expect(all).toContain('billed yearly');
  });

  it('renders the timeline with NO anchor when the year will not price', async () => {
    withTrial(3);
    const all = deepText(await render());
    expect(all).toContain('First charge');
    // Silence, not a guessed number — the standalone screen used to self-skip
    // for exactly this reason.
    expect(all).not.toContain('a day');
    expect(all).not.toContain('billed yearly');
  });
});
