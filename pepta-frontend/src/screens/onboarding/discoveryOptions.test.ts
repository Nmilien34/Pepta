// The discovery ask's option list: all seven sources present, the six brands
// shuffled per mount (position bias), "Somewhere else" ALWAYS last — the
// honest catch-all must never migrate into the grid.

import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Image: "Image", View: "View" }));
vi.mock("react-native-svg", () => ({
  default: "Svg",
  Circle: "Circle",
  Path: "Path",
  Rect: "Rect",
}));
vi.mock("../../components", () => ({ ConvoScreen: "ConvoScreen" }));

import { buildDiscoveryOptions } from "./DiscoverySourceScreen";

describe("buildDiscoveryOptions", () => {
  it("contains all seven sources exactly once, Somewhere else last", () => {
    const options = buildDiscoveryOptions();
    expect(options).toHaveLength(7);
    expect(options[6]!.value).toBe("other");
    expect(options[6]!.label).toBe("Somewhere else");
    expect(new Set(options.map((o) => o.value))).toEqual(
      new Set(["app_store", "instagram", "facebook", "tiktok", "youtube", "friends", "other"]),
    );
  });

  it("shuffles the six brands but never the catch-all", () => {
    // A deterministic "random" that reverses the list: proves order derives
    // from the RNG while `other` stays pinned.
    const reversed = buildDiscoveryOptions(() => 0);
    expect(reversed[6]!.value).toBe("other");
    const forward = buildDiscoveryOptions(() => 0.999);
    expect(forward[6]!.value).toBe("other");
    expect(reversed.slice(0, 6).map((o) => o.value)).not.toEqual(
      forward.slice(0, 6).map((o) => o.value),
    );
  });

  it("gives every brand a leading logo and the catch-all none", () => {
    const options = buildDiscoveryOptions();
    for (const option of options.slice(0, 6)) expect(option.leading).toBeTruthy();
    expect(options[6]!.leading).toBeUndefined();
  });
});
