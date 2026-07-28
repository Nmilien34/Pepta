import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeanMassBeatScreen } from "./LeanMassBeatScreen";
import { leanMassSettleMs } from "./leanMassBars";

const mocks = vi.hoisted(() => ({
  onContinue: vi.fn(),
  impactAsync: vi.fn((_style: string) => Promise.resolve()),
}));

vi.mock("react-native", () => {
  class Value {
    constructor(public value: number) {}
    interpolate({ outputRange }: { outputRange: number[] }) {
      // Report the END of the range: the assertions care about where the bars
      // land, and a stub that never moves cannot tell us that.
      return outputRange[outputRange.length - 1];
    }
    addListener() {
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
    },
    Easing: { out: (v: unknown) => v, cubic: "cubic", inOut: (v: unknown) => v, ease: "ease", bezier: () => "bezier" },
    Platform: { OS: "ios" },
    StyleSheet: { create: (s: unknown) => s, absoluteFill: {} },
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement("Text", props, children),
    View: "View",
  };
});

vi.mock("expo-haptics", () => ({
  impactAsync: mocks.impactAsync,
  ImpactFeedbackStyle: { Soft: "soft", Light: "light", Medium: "medium", Rigid: "rigid", Heavy: "heavy" },
}));

vi.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));

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
  convo: { surface: "#fff", hairline: "#eee", ink: "#111", soft: "#555", faint: "#999" },
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

describe("LeanMassBeatScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.onContinue.mockClear();
    mocks.impactAsync.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  async function renderScreen(props: Partial<React.ComponentProps<typeof LeanMassBeatScreen>> = {}) {
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(
        <LeanMassBeatScreen
          progress={0.19}
          context="Tirzepatide · 5 mg · weekly."
          onContinue={mocks.onContinue}
          {...props}
        />,
      );
    });
    return tree!;
  }

  async function settle() {
    await act(async () => {
      vi.advanceTimersByTime(leanMassSettleMs() + 400);
    });
  }

  it("mounts and renders both bars without throwing", async () => {
    // This screen is why the guard exists: the last mascot-bearing beat that
    // shipped took the whole app down on entry. Mounting it is the assertion.
    const tree = await renderScreen();
    const text = textOf(tree);
    expect(text).toContain("Unmanaged");
    expect(text).toContain("Protein + pace");

    // The companion mounts only once the bars settle — an opacity-0 bubble is
    // still announced by VoiceOver, so it must not be in the tree before then.
    expect(tree.root.findAll((n) => String(n.type) === "LivingMascot")).toHaveLength(0);
    await settle();
    expect(tree.root.findAll((n) => String(n.type) === "LivingMascot")).toHaveLength(1);
  });

  it("shows the cited number on the unmanaged bar and no number on the other", async () => {
    // The content-integrity guard, at the render layer this time: we cite
    // 25–39% for unmanaged lean-mass loss and have no source for how much
    // protein + pace recover. Exactly one percentage may appear on the bars.
    const tree = await renderScreen();
    // 39% twice — the bar label and the citation line — and NOTHING else.
    // An earlier version tweened the label 11% → 39% as the bar climbed, which
    // put uncited percentages on screen; this is what caught it.
    const percentages = textOf(tree).match(/\d+%/g) ?? [];
    expect(percentages).toEqual(["39%", "39%"]);
  });

  it("keeps the citation on screen with the chart", async () => {
    expect(textOf(await renderScreen())).toContain("STEP-1 & SURMOUNT-1 body-composition analyses");
  });

  it("speaks in the name the user chose, not a stock mascot name", async () => {
    const tree = await renderScreen({ companionName: "Sushi" });
    await settle();
    expect(textOf(tree)).toContain("Sushi here. That second bar is my whole job.");
  });

  it("falls back to Pep when they never named it", async () => {
    const tree = await renderScreen();
    await settle();
    expect(textOf(tree)).toContain("Pep here.");
  });

  it("fires a haptic as each bar lands", async () => {
    await renderScreen();
    await settle();
    // One per bar — the heavier impact belongs to the bigger climb.
    expect(mocks.impactAsync.mock.calls.map((c) => c[0])).toContain("heavy");
    expect(mocks.impactAsync.mock.calls.map((c) => c[0])).toContain("light");
  });

  it("advances on Show me", async () => {
    const tree = await renderScreen();
    const button = tree.root.find(
      (n) => String(n.type) === "ConvoButton" && n.props.accessibilityLabel === "Show me",
    );
    await act(async () => button.props.onPress());
    expect(mocks.onContinue).toHaveBeenCalledTimes(1);
  });
});
