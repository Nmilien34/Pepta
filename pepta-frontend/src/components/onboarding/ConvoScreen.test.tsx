// ConvoScreen's answer layouts.
//
// The wrapping chip grid is the default and 22 onboarding turns depend on it,
// so `layout="list"` is strictly ADDITIVE — the first describe here exists to
// fail loudly if the list work leaks into the default path.
//
// The list exists because the chip grid has no shared alignment: chips are
// content-sized, so no two labels start at the same x and the right edge rags
// on every row. With seven brand logos that reads as a pile, not a list.
//
// Motion is disabled through OnboardingMotionContext, NOT a prop — ConvoScreen
// reads `animate` from context, and with it false both `contextDone` and
// `typed` start true, so the options and the accent square render immediately.

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => {
  class Value {
    constructor(public v: number) {}
    interpolate() {
      return 0;
    }
    setValue() {}
  }
  const runner = () => ({ start: (cb?: () => void) => cb?.() });
  return {
    Animated: {
      View: "Animated.View",
      Text: "Animated.Text",
      Value,
      timing: runner,
      sequence: runner,
      parallel: runner,
      delay: runner,
      loop: runner,
    },
    Easing: { bezier: () => 0, out: () => 0, inOut: () => 0, ease: 0, linear: 0 },
    Platform: { OS: "ios" },
    Pressable: ({
      children,
      style,
      ...rest
    }: {
      children?: React.ReactNode | ((s: { pressed: boolean }) => React.ReactNode);
      style?: unknown;
    }) =>
      React.createElement(
        "Pressable",
        { ...rest, style: typeof style === "function" ? style({ pressed: false }) : style },
        typeof children === "function" ? children({ pressed: false }) : children,
      ),
    ScrollView: "ScrollView",
    StatusBar: "StatusBar",
    StyleSheet: { create: (s: Record<string, unknown>) => s, flatten: (s: unknown) => s },
    Text: "Text",
    View: "View",
  };
});
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("expo-haptics", () => ({ impactAsync: () => {}, ImpactFeedbackStyle: { Medium: 1 } }));
// Forwards ALL props. A mock that keeps only `name` silently turns every
// assertion about the icon's colour or size into a comparison against
// undefined, which passes for the wrong reason.
vi.mock("../Icon", () => ({
  Icon: (props: Record<string, unknown>) => React.createElement("Icon", props),
}));
// Forwards `style` — the context line's scale lives on the Typewriter itself,
// so a mock that drops it makes every type-size assertion here vacuous.
vi.mock("./Typewriter", () => ({
  Typewriter: ({ text, style }: { text: string; style?: unknown }) =>
    React.createElement("Text", { style }, text),
}));

import { ConvoScreen, OnboardingMotionContext } from "./ConvoScreen";
import { one } from "../../tests/byLabel";
import { convo } from "./convoTokens";

/** WCAG relative luminance, for asserting a requirement rather than a hex. */
function contrastOnWhite(inkAlpha: number) {
  const chan = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const mix = (c: number) => Math.round(inkAlpha * c + (1 - inkAlpha) * 255);
  const [r, g, b] = [0x17, 0x14, 0x1f].map(mix) as [number, number, number];
  const l = 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  return (1.05) / (l + 0.05);
}

/** The alpha out of an "rgba(23,20,31,X)" convo token. */
function alphaOf(token: string) {
  return Number(token.match(/,\s*([\d.]+)\)$/)![1]);
}

const OPTIONS = [
  { label: "App Store search", value: "app_store" },
  { label: "Reddit", value: "reddit" },
  { label: "Somewhere else", value: "other" },
];

// Spelled as escapes on purpose: the whole assertion turns on which of two
// visually identical characters is in the source.
const NBSP = "\u00A0";
const SPACE = "\u0020";
const ACCENT = "■";

function render(extra: Record<string, unknown> = {}) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <OnboardingMotionContext.Provider value={{ animate: false }}>
        <ConvoScreen
          progress={0.14}
          question="Where did you find us?"
          options={OPTIONS}
          onAnswer={() => {}}
          {...extra}
        />
      </OnboardingMotionContext.Provider>,
    );
  });
  return tree;
}

/**
 * Flattened style of the Pressable wrapping a given label.
 *
 * Via `one`, which throws on a duplicate rather than taking the first match —
 * two controls sharing a label is both a false-green risk here and a real
 * screen-reader defect on the screen itself.
 */
function skinOf(tree: TestRenderer.ReactTestRenderer, label: string) {
  const p = one(tree, label);
  return Object.assign({}, ...[p.props.style].flat().filter(Boolean));
}

function chevrons(tree: TestRenderer.ReactTestRenderer) {
  return tree.root.findAll(
    (n) => String(n.type) === "Icon" && n.props.name === "chevron-forward",
  );
}

describe("the default chip layout is untouched", () => {
  // 22 onboarding turns render through this path. If the list work changes
  // the default, every one of them silently changes shape.
  it("keeps the pill radius and the padding-driven height", () => {
    const skin = skinOf(render(), "Reddit");

    expect(skin.borderRadius).toBe(24);
    expect(skin.paddingVertical).toBe(13);
    expect(skin.height).toBeUndefined();
  });

  it("draws no trailing chevron", () => {
    expect(chevrons(render())).toHaveLength(0);
  });
});

describe('layout="list" gives every row the same edges', () => {
  it("is a fixed-height row, not a pill", () => {
    const skin = skinOf(render({ layout: "list" }), "Reddit");

    // 60pt fixed: the height stops depending on the label, which is what makes
    // the column immune to Dynamic Type. Radius 16 on 60 keeps four corners —
    // 24 on a ~49pt chip is a full pill with none left.
    expect(skin.height).toBe(60);
    expect(skin.borderRadius).toBe(16);
    expect(skin.borderRadius).toBeLessThan(60 / 2);
  });

  it("gives every option the full row as its tap target", () => {
    // "Reddit" and "Somewhere else" carry equal weight; as chips their hit
    // areas differed by roughly 2x on string length alone.
    const tree = render({ layout: "list" });

    for (const label of ["App Store search", "Reddit", "Somewhere else"]) {
      expect(skinOf(tree, label).alignSelf).toBe("stretch");
    }
  });

  it("announces that tapping does something, on every row", () => {
    // Nothing on the shipped screen said single-select until you tapped it.
    expect(chevrons(render({ layout: "list" }))).toHaveLength(OPTIONS.length);
  });
});

describe("the accent square stays on the question", () => {
  it("is joined to it by a non-breaking space", () => {
    // A normal space is a legal break opportunity, so past ~110% Dynamic Type
    // the square orphaned onto its own line beneath the question. Type scales
    // with the user's setting; the container does not.
    const found = render({ questionAccent: true })
      .root.findAll((n) => String(n.type) === "Text")
      .flatMap((n) => (typeof n.props.children === "string" ? [n.props.children] : []))
      .filter((t) => t.includes(ACCENT));

    expect(found).toHaveLength(1);
    expect(found[0]).toBe(`${NBSP}${ACCENT}`);
    expect(found[0]).not.toBe(`${SPACE}${ACCENT}`);
  });
});

describe("the context line has two scales", () => {
  // The 29pt context is a DISPLAY size because on most turns it carries the
  // user's previous answer echoed back at full scale (convoTokens: "the
  // previous answer echoes at full type scale, dimmed to 50%"). When the line
  // is Pep talking instead, that size makes an aside louder than the question
  // under it — and, measured in the real face, "Quick one while I set up —"
  // is 334.4pt against 337 available, so it survives on one line by 2.6pt at
  // default text size and wraps outright at 120%.
  it("stays at display scale by default, for echoed answers", () => {
    const tree = render({ context: "You said 190 lbs." });
    const line = tree.root.findAll((n) => String(n.type) === "Text")
      .find((n) => Object.assign({}, ...[n.props.style].flat().filter(Boolean)).fontSize === 29);

    expect(line).toBeDefined();
  });

  it("drops to an aside when the line is not an echo", () => {
    const tree = render({ context: "Quick one while I set up —", contextAside: true });
    const sizes = tree.root.findAll((n) => String(n.type) === "Text")
      .map((n) => Object.assign({}, ...[n.props.style].flat().filter(Boolean)).fontSize);

    expect(sizes).toContain(20);
    expect(sizes).not.toContain(29);
  });
});

describe("the row chevron is legible", () => {
  it("meets the 3:1 minimum for a non-text UI component", () => {
    // It is not decoration — it is the row's only at-rest signal that tapping
    // does something, which makes it a meaningful component under WCAG.
    const chevron = chevrons(render({ layout: "list" }))[0]!;

    expect(chevron.props.color).toMatch(/^rgba\(23,\s*20,\s*31,/);
    expect(contrastOnWhite(alphaOf(chevron.props.color))).toBeGreaterThanOrEqual(3);
  });

  it("is not convo.faint, which fails at 2.57:1", () => {
    // The value this shipped with. Pinned so it cannot come back.
    expect(contrastOnWhite(alphaOf(convo.faint))).toBeLessThan(3);
    expect(chevrons(render({ layout: "list" }))[0]!.props.color).not.toBe(convo.faint);
  });
});
