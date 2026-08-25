// The scored payoff.
//
// riskProfile.test.ts covers the arithmetic. What only this file can pin is the
// part with consequences outside itself:
//
//   1. `onSettled` — the reveal hangs its CONFETTI and success haptic on this.
//      If it never fires the celebration never happens; if it fires twice the
//      user gets two bursts. It replaced a sequence that was timing the same
//      callback off a curve that had already been deleted.
//   2. The severity colours. Green is a real outcome for someone doing this
//      right, and it is what makes the orange mean anything — a component that
//      painted everything orange would look fine and say nothing.

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ starts: [] as Array<(r: { finished: boolean }) => void> }));

vi.mock("react-native", () => {
  class Value {
    constructor(public v: number) {}
    interpolate() {
      return 0;
    }
  }
  return {
    Animated: {
      View: "Animated.View",
      Value,
      // Captures each start callback so a test can land the animation.
      timing: () => ({
        start: (cb?: (r: { finished: boolean }) => void) => {
          if (cb) mocks.starts.push(cb);
        },
        stop: () => {},
      }),
      createAnimatedComponent: (c: unknown) => c,
    },
    Easing: { out: () => 0, cubic: 0 },
    StyleSheet: { create: (s: Record<string, unknown>) => s },
    Text: "Text",
    View: "View",
  };
});
vi.mock("react-native-svg", () => ({ default: "Svg", Circle: "Circle" }));
vi.mock("../CountUp", () => ({
  CountUp: ({ value }: { value: number }) => React.createElement("CountUp", { value }),
}));
vi.mock("../useHapticRamp", () => ({ useHapticRamp: () => {} }));

import { RiskPayoff } from "./RiskPayoff";
import type { RiskProfile } from "../../utils/riskProfile";

const profile = (score: number, driverScores: number[]): RiskProfile => ({
  score,
  drivers: driverScores.map((s, i) => ({
    key: (["pace", "training", "age", "activity"] as const)[i]!,
    label: ["Pace you picked", "Resistance training", "Age", "Daily movement"][i]!,
    score: s,
  })),
});

function render(p: RiskProfile, run: boolean, onSettled?: () => void) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<RiskPayoff profile={p} run={run} onSettled={onSettled} />);
  });
  return tree;
}

/** Every stroke/fill colour the component actually paints. */
const colours = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAll((n) => typeof n.type === "string")
    .flatMap((n) => {
      const style = Object.assign({}, ...[n.props.style].flat().filter(Boolean));
      return [n.props.stroke, style.backgroundColor].filter(
        (c): c is string => typeof c === "string" && c.startsWith("#"),
      );
    });

beforeEach(() => {
  mocks.starts.length = 0;
});

describe("onSettled — the confetti depends on it", () => {
  it("fires once the ring finishes closing", () => {
    const settled = vi.fn();
    render(profile(68, [82, 74, 61, 38]), true, settled);

    expect(settled).not.toHaveBeenCalled();
    act(() => mocks.starts.forEach((cb) => cb({ finished: true })));
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("never fires twice, however many animations report in", () => {
    // Bars complete too, and each one calls back. Only the ring may settle.
    const settled = vi.fn();
    render(profile(68, [82, 74, 61, 38]), true, settled);

    act(() => mocks.starts.forEach((cb) => cb({ finished: true })));
    act(() => mocks.starts.forEach((cb) => cb({ finished: true })));
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("does not fire when the animation is interrupted", () => {
    // An unmount mid-close must not fire the celebration.
    const settled = vi.fn();
    render(profile(68, [82, 74, 61, 38]), true, settled);

    act(() => mocks.starts.forEach((cb) => cb({ finished: false })));
    expect(settled).not.toHaveBeenCalled();
  });

  it("does not start at all until the reveal says so", () => {
    const settled = vi.fn();
    render(profile(68, [82, 74, 61, 38]), false, settled);

    expect(mocks.starts).toHaveLength(0);
    expect(settled).not.toHaveBeenCalled();
  });
});

describe("severity is visible, not uniform", () => {
  it("paints a low driver green and a high one orange in the same profile", () => {
    // The spread is the argument. All-orange would look identical to a real
    // reading and carry no information.
    const painted = colours(render(profile(68, [82, 74, 61, 38]), true));

    expect(painted).toContain("#FF8A3D");
    expect(painted).toContain("#34C759");
  });

  it("colours the ring by the total, not by the worst driver", () => {
    // A careful user with one bad driver must still read as low risk overall.
    const ring = render(profile(22, [40, 18, 15, 34]), true).root.findAll(
      (n) => String(n.type) === "Circle" && typeof n.props.stroke === "string" && n.props.stroke.startsWith("#"),
    );

    expect(ring[0]!.props.stroke).toBe("#34C759");
  });
});
