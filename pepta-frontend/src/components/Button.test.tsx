// The primary button, after the flat-fill restyle.
//
// REVERSED DELIBERATELY. This file used to assert "a restrained premium
// gradient and subtle highlight" — #6751E8→#8C63F4 plus a white top sheen, in
// a full pill under a coloured glow. That was three softening effects at once
// with no defined boundary, and the gradient was the worst of them: a ~5%
// luminance shift across 56pt is too subtle to read as intentional and too
// present to read as one clean colour, so the fill looked unresolved.
//
// The new contract is the opposite, and each half is asserted here because
// each is easy to reintroduce by accident:
//
//   flat fill, no gradient      — one colour, resolved
//   a one-step-darker edge      — the stroke IS the shape's boundary
//   radius 14, not a pill       — corners are what make a shape look built
//   press darkens, never scales — a spring blurs the edge for its duration,
//                                 which is the exact quality being bought
//
// The fill is #6751E8, the old gradient's own deeper end — not a new colour,
// and the accessible one: white on it is 5.2:1 (AA), where the lighter
// #7C5CFC was 4.3:1 and failed for anything but large text.

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

// Pressable resolves its children function at render, so the pressed branch
// is only reachable by telling the mock which state to render.
const mocks = vi.hoisted(() => ({ pressed: false }));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: ({
    children,
    ...props
  }: {
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
  }) =>
    React.createElement(
      "Pressable",
      props,
      typeof children === "function" ? children({ pressed: mocks.pressed }) : children,
    ),
  View: "View",
}));

vi.mock("../theme", () => ({
  useTheme: () => ({
    colors: {
      onPrimary: "#fff",
      primary: "#7C5CFC",
      buttonFill: "#6751E8",
      buttonEdge: "#5642C4",
      buttonFillPressed: "#5642C4",
      buttonEdgePressed: "#4736A8",
      surfaceAlt: "#f4f4f5",
      textPrimary: "#111",
    },
    sizes: {
      button: { height: 56, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 22 },
    },
    spacing: { sm: 8 },
  }),
}));

vi.mock("./AppText", () => ({
  AppText: ({ children }: { children?: React.ReactNode }) => children,
}));

/** The styled View inside the Pressable — the button's actual skin. */
function skinOf(tree: TestRenderer.ReactTestRenderer) {
  const pressable = tree.root.find((n) => String(n.type) === "Pressable");
  const view = pressable.findAll((n) => String(n.type) === "View")[0]!;
  return Object.assign({}, ...[view.props.style].flat().filter(Boolean));
}

function render(props: Partial<React.ComponentProps<typeof Button>> = {}) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<Button label="Continue" {...props} />);
  });
  return tree;
}

describe("the primary button is a flat fill with its own edge", () => {
  it("uses one solid colour — no gradient anywhere", () => {
    const tree = render();

    // The regression that matters: a gradient is what made the old fill read
    // as unresolved, and it is one import away from returning.
    expect(tree.root.findAll((n) => String(n.type) === "LinearGradient")).toHaveLength(0);
    expect(skinOf(tree).backgroundColor).toBe("#6751E8");
  });

  it("draws a one-step-darker edge", () => {
    const skin = skinOf(render());

    expect(skin.borderColor).toBe("#5642C4");
    expect(skin.borderWidth).toBe(1.5);
  });

  it("keeps four corners — radius 14, never a pill", () => {
    // At 999 on a 56pt height both ends are semicircles and the shape has no
    // corners left, which is why it read as a lozenge.
    expect(skinOf(render()).borderRadius).toBe(14);
    expect(skinOf(render()).borderRadius).toBeLessThan(56 / 2);
  });

  it("carries no shadow", () => {
    // A coloured glow under a flat fill puts the softness straight back.
    const skin = skinOf(render());

    expect(skin.shadowOpacity).toBeUndefined();
    expect(skin.shadowRadius).toBeUndefined();
  });
});

describe("press darkens rather than moving the shape", () => {
  it("has no scale transform to blur the edge", () => {
    const skin = skinOf(render());

    expect(skin.transform).toBeUndefined();
  });

  it("swaps to the darker fill and edge while held", () => {
    mocks.pressed = true;
    try {
      const skin = skinOf(render());

      expect(skin.backgroundColor).toBe("#5642C4");
      expect(skin.borderColor).toBe("#4736A8");
      // And still no movement — darkening REPLACES the spring, it does not
      // join it.
      expect(skin.transform).toBeUndefined();
    } finally {
      mocks.pressed = false;
    }
  });
});

describe("the other variants share the edge logic", () => {
  it("gives secondary a tinted fill with its own border", () => {
    // The pair has to read as one family, or the restyle only fixes primary.
    const skin = skinOf(render({ variant: "secondary" }));

    expect(skin.backgroundColor).toBe("#EFEBFF");
    expect(skin.borderColor).toBe("#DCD3FF");
    expect(skin.borderRadius).toBe(14);
  });

  it("labels secondary in buttonFill, which PASSES on the tinted ground", () => {
    // The regression this catches: the first cut of the restyle used `primary`
    // (#7C5CFC) here, which is 3.75:1 on #EFEBFF — a fail, introduced by a
    // change argued for on accessibility grounds. #6751E8 is 4.59:1.
    const tree = render({ variant: "secondary" });
    const label = tree.root.findAll((n) => n.props?.color != null)[0];

    expect(label?.props.color).toBe("buttonFill");
  });

  it("leaves ghost transparent, with no edge to draw", () => {
    const skin = skinOf(render({ variant: "ghost" }));

    expect(skin.backgroundColor).toBe("transparent");
    expect(skin.borderColor).toBe("transparent");
  });

  it("dims a disabled button without changing its shape", () => {
    expect(skinOf(render({ disabled: true })).opacity).toBe(0.45);
  });
});
