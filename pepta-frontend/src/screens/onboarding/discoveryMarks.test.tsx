// How each discovery mark meets its 40pt slot.
//
// This is the part of the redesign with no visual safety net: get `fit` wrong
// and the screen still renders, still passes typecheck, and just looks subtly
// broken — a clipped icon with its corners shaved, or a hard orange square
// with none. Which treatment a mark needs is a property of the FILE, and each
// was established by decoding the asset:
//
//   discovery-appstore.png   RGBA 292x292, alpha 0 at all four corners
//   discovery-reddit.png     8-bit indexed, NO tRNS chunk, #FF4500 on every edge
//   discovery-instagram.png  RGB 96x96, no alpha channel at all
//
// So the App Store mark must NOT be clipped (it carries its own corners and a
// second clip would shave them) and the other two MUST be (the slot is the
// only place their corners can come from).

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Image: "Image",
  View: "View",
}));
vi.mock("react-native-svg", () => ({
  default: "Svg",
  Circle: "Circle",
  Path: "Path",
  Rect: "Rect",
}));
vi.mock("../../components", () => ({ ConvoScreen: "ConvoScreen" }));

import { DISCOVERY_OPTIONS } from "./DiscoverySourceScreen";

const SLOT = 40;
/** 6.5 in a 26-unit viewBox, rendered at 40 — what the SVG marks draw. */
const RADIUS = 10;

function markOf(label: string) {
  const option = DISCOVERY_OPTIONS.find((o) => o.label === label)!;
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<>{option.leading}</>);
  });
  const slot = tree.root.findAll((n) => String(n.type) === "View")[0]!;
  const style = Object.assign({}, ...[slot.props.style].flat().filter(Boolean));
  const image = tree.root.findAll((n) => String(n.type) === "Image")[0];
  return { style, resizeMode: image?.props.resizeMode as string | undefined };
}

describe("every mark occupies the same 40pt square", () => {
  it.each(DISCOVERY_OPTIONS.map((o) => o.label))("%s", (label) => {
    const { style } = markOf(label);

    // The uniform footprint is the whole reason the left column reads as a
    // column. The old marks were 26pt with `contain`, and discovery-apple.png
    // was 82x96 — not square — so it could never fill its box at all.
    expect(style.width).toBe(SLOT);
    expect(style.height).toBe(SLOT);
  });
});

describe("clipping is decided by the asset, not by taste", () => {
  it("does NOT clip the App Store icon, which carries its own corners", () => {
    const { style, resizeMode } = markOf("App Store search");

    expect(style.borderRadius).toBeUndefined();
    expect(style.overflow).toBeUndefined();
    // `contain` preserves the mark's shape; `cover` would crop it if the asset
    // were ever replaced with a non-square one.
    expect(resizeMode).toBe("contain");
  });

  it.each([
    ["Reddit", "a hard #FF4500 square with no transparency anywhere"],
    ["Instagram", "an RGB PNG with no alpha channel"],
  ])("clips %s — %s", (label) => {
    const { style, resizeMode } = markOf(label);

    expect(style.borderRadius).toBe(RADIUS);
    expect(style.overflow).toBe("hidden");
    // `cover` so the clip is filled edge to edge and leaves no sliver.
    expect(resizeMode).toBe("cover");
  });
});

describe("the drawn marks need no slot treatment", () => {
  it.each(["Friends", "Facebook", "TikTok", "YouTube", "Somewhere else"])(
    "%s draws its own shape at full bleed",
    (label) => {
      const { style } = markOf(label);

      // Each SVG paints its own rect or circle, so a slot clip would be a
      // second rounding on top of one that is already correct.
      expect(style.borderRadius).toBeUndefined();
      expect(style.overflow).toBeUndefined();
    },
  );
});
