import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SymptomWeekBeatScreen } from "./SymptomWeekBeatScreen";
import { CURVE_LENGTH, DRAW_DURATION_MS } from "./symptomWeek";

const mocks = vi.hoisted(() => ({
  onContinue: vi.fn(),
  impactAsync: vi.fn((_style: string) => Promise.resolve()),
  listeners: [] as ((v: { value: number }) => void)[],
}));

vi.mock("react-native", () => {
  class Value {
    constructor(public value: number) {}
    interpolate({ outputRange }: { outputRange: number[] }) {
      return outputRange[outputRange.length - 1];
    }
    addListener(fn: (v: { value: number }) => void) {
      mocks.listeners.push(fn);
      return "id";
    }
    removeListener() {
      return undefined;
    }
  }
  const finished = {
    start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }),
    stop: () => undefined,
  };
  return {
    Animated: {
      Value,
      View: "Animated.View",
      Text: "Animated.Text",
      timing: vi.fn(() => finished),
      spring: vi.fn(() => finished),
      loop: vi.fn(() => ({ start: () => undefined, stop: () => undefined })),
      createAnimatedComponent: (c: unknown) => c,
    },
    Easing: { out: (v: unknown) => v, cubic: "cubic", inOut: (v: unknown) => v, bezier: () => "bezier" },
    Platform: { OS: "ios" },
    StyleSheet: { create: (s: unknown) => s, absoluteFill: {} },
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement("Text", props, children),
    View: "View",
  };
});

vi.mock("react-native-svg", () => ({
  default: "Svg",
  Circle: "Circle",
  ClipPath: "ClipPath",
  Defs: "Defs",
  G: "G",
  Line: "Line",
  Path: "Path",
  Rect: "Rect",
}));

vi.mock("expo-haptics", () => ({
  impactAsync: mocks.impactAsync,
  ImpactFeedbackStyle: { Soft: "soft", Light: "light", Medium: "medium", Rigid: "rigid", Heavy: "heavy" },
}));

vi.mock("../../components/LivingMascot", () => ({
  LivingMascot: ({ pose }: { pose: string }) => React.createElement("LivingMascot", { pose }),
}));

vi.mock("../../theme/typography", () => ({
  typography: { fonts: { medium: "m", semiBold: "sb", bold: "b", heavy: "h" } },
}));

vi.mock("../../components", () => ({
  ConvoScreen: ({
    children,
    footer,
    context,
    question,
    onTyped,
  }: {
    children?: React.ReactNode;
    footer?: React.ReactNode;
    context?: string;
    question?: string;
    onTyped?: () => void;
  }) => {
    onTyped?.();
    return React.createElement(
      "View",
      null,
      React.createElement("Text", null, context),
      React.createElement("Text", null, question),
      children,
      footer,
    );
  },
  ConvoButton: ({ label, onPress }: { label: string; onPress?: () => void }) =>
    React.createElement("ConvoButton", { accessibilityLabel: label, onPress }, label),
  convo: { surface: "#fff", hairline: "#eee", ink: "#111", faint: "#999", primary: "#7C5CFC" },
}));

function textOf(tree: TestRenderer.ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === "string") out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object" && "children" in (node as never)) {
      walk((node as { children: unknown }).children);
    }
  };
  walk(tree.toJSON());
  return out.join("");
}

describe("SymptomWeekBeatScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.onContinue.mockClear();
    mocks.impactAsync.mockClear();
    mocks.listeners.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  async function renderScreen(effect: "nausea" | "fatigue" | "constipation" = "nausea") {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <SymptomWeekBeatScreen
          progress={0.82}
          context="Nausea and fatigue. Noted."
          effect={effect}
          onContinue={mocks.onContinue}
        />,
      );
    });
    return tree!;
  }

  it("mounts and draws a single curve", async () => {
    const tree = await renderScreen();
    // ONE stroked path. A second would mean somebody added the invented
    // "without tracking" comparison — read the note in symptomWeek.ts.
    const strokedPaths = tree.root
      .findAll((n) => String(n.type) === "Path")
      .filter((n) => n.props.stroke != null);
    expect(strokedPaths).toHaveLength(1);
    expect(strokedPaths[0]!.props.strokeDasharray).toBe(String(CURVE_LENGTH));
  });

  it("titles the card with the symptom it was given", async () => {
    expect(textOf(await renderScreen("nausea"))).toContain("Nausea after a dose change");
    expect(textOf(await renderScreen("constipation"))).toContain("Constipation after a dose change");
  });

  it("puts no invented number anywhere on screen", async () => {
    // The card carries a citation, not a statistic. "Day 7" is an axis label.
    const text = textOf(await renderScreen());
    expect(text).not.toMatch(/\d+%/);
    expect(text).toContain("STEP-1 & SURMOUNT-1 safety analyses");
  });

  it("keeps the companion quiet until the curve has finished drawing", async () => {
    const tree = await renderScreen();
    expect(textOf(tree)).not.toContain("I can’t flatten it");
    await act(async () => {
      vi.advanceTimersByTime(DRAW_DURATION_MS + 400);
    });
    expect(textOf(tree)).toContain("I can’t flatten it. But I’ll show you yours.");
  });

  it("fires a haptic as the line crests and again as it settles", async () => {
    await renderScreen();
    // Drive the draw value past both marks (0.3 and 1).
    await act(async () => {
      mocks.listeners.forEach((fn) => fn({ value: 0.35 }));
      mocks.listeners.forEach((fn) => fn({ value: 1 }));
    });
    expect(mocks.impactAsync.mock.calls.map((c) => c[0])).toEqual(["medium", "soft"]);
  });

  it("fires each mark once, not on every frame", async () => {
    await renderScreen();
    await act(async () => {
      for (const v of [0.31, 0.4, 0.5, 0.9, 1, 1]) {
        mocks.listeners.forEach((fn) => fn({ value: v }));
      }
    });
    expect(mocks.impactAsync).toHaveBeenCalledTimes(2);
  });

  it("advances on the CTA", async () => {
    const tree = await renderScreen();
    const button = tree.root.find(
      (n) => String(n.type) === "ConvoButton" && n.props.accessibilityLabel === "Show me mine",
    );
    await act(async () => button.props.onPress());
    expect(mocks.onContinue).toHaveBeenCalledTimes(1);
  });
});
