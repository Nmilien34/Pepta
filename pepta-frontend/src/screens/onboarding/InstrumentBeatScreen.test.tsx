import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { InstrumentBeatScreen } from "./InstrumentBeatScreen";

vi.mock("react-native", () => {
  class Value {
    constructor(public value: number) {}
    interpolate({ outputRange }: { outputRange: number[] }) {
      return outputRange[outputRange.length - 1];
    }
  }
  return {
    Animated: {
      Value,
      View: "Animated.View",
      timing: vi.fn(() => ({ start: () => undefined, stop: () => undefined })),
      createAnimatedComponent: (c: unknown) => c,
    },
    StyleSheet: { create: (s: unknown) => s },
    Text: ({ children, ...p }: { children?: React.ReactNode }) =>
      React.createElement("Text", p, children),
    View: "View",
  };
});

vi.mock("react-native-svg", () => ({
  default: "Svg",
  Circle: "Circle",
  ClipPath: "ClipPath",
  Defs: "Defs",
  G: "G",
  Path: "Path",
  Rect: "Rect",
}));

vi.mock("../../theme/typography", () => ({
  typography: { fonts: { medium: "m", semiBold: "sb", bold: "b", heavy: "h" } },
}));

vi.mock("../../components", () => ({
  ConvoScreen: ({
    children,
    footer,
    onTyped,
  }: {
    children?: React.ReactNode;
    footer?: React.ReactNode;
    onTyped?: () => void;
  }) => {
    onTyped?.();
    return React.createElement("View", null, children, footer);
  },
  ConvoButton: ({ label, onPress }: { label: string; onPress?: () => void }) =>
    React.createElement("ConvoButton", { accessibilityLabel: label, onPress }, label),
  convo: { surface: "#fff", hairline: "#eee", ink: "#111", faint: "#999", primary: "#7C5CFC" },
}));

describe("InstrumentBeatScreen", () => {
  async function render() {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <InstrumentBeatScreen progress={0.4} context="Tirzepatide · 5 mg · Sundays." onContinue={vi.fn()} />,
      );
    });
    return tree!;
  }

  it("mounts the chart without throwing", async () => {
    // The guard that matters: a Fragment inside <Svg> takes the whole app down
    // on entry, which is how a TestFlight build shipped an error screen. The
    // clipped group here must stay a <G>.
    const tree = await render();
    expect(tree.root.findAll((n) => String(n.type) === "Svg")).toHaveLength(1);
  });

  it("draws the soft area under the line, not just a bare stroke", async () => {
    // The design frame used to say "no fill — one thin purple stroke". It no
    // longer does; a drawn curve carries an area under it across the flow.
    const tree = await render();
    const paths = tree.root.findAll((n) => String(n.type) === "Path");
    const filled = paths.filter((n) => n.props.fill && n.props.fill !== "none");
    const stroked = paths.filter((n) => n.props.stroke);
    expect(filled.length).toBeGreaterThanOrEqual(1);
    expect(stroked).toHaveLength(1);
  });

  it("hides the whole line at rest — dash length must not under-measure the path", async () => {
    // The real path measures 336.6. It was hardcoded at 340, so the first ~1%
    // of the draw rendered nothing; under-measuring instead would leave a stub
    // of curve visible before the animation starts.
    const tree = await render();
    const stroked = tree.root.find((n) => String(n.type) === "Path" && n.props.stroke);
    const dash = Number(stroked.props.strokeDasharray);
    expect(dash).toBeGreaterThanOrEqual(337);
    expect(dash).toBeLessThan(345);
  });

  it("marks the peak of the modelled curve", async () => {
    const tree = await render();
    expect(tree.root.findAll((n) => String(n.type) === "Circle").length).toBeGreaterThanOrEqual(1);
  });
});
