// The discovery ask's option list: FIXED order by explicit call (Nick,
// 2026-08-06) — organic channels first because that's where users actually
// come from today, channels we're not on yet last among brands, and the
// "Somewhere else" catch-all always pinned to the end.
//
// Reddit joined on 2026-08-24, third. It is the only entry whose placement is
// not covered by the original rule: that rule mixes where users come from with
// whether we're present on a channel, and Reddit scores high on the first and
// zero on the second. Ranked on volume, because until now it had no row at all
// and every r/Ozempic arrival was answering "Somewhere else" instead.

import { describe, expect, it, vi } from "vitest";
import { discoverySourceSchema } from "@pepta/shared";

vi.mock("react-native", () => ({ Image: "Image", View: "View" }));
vi.mock("react-native-svg", () => ({
  default: "Svg",
  Circle: "Circle",
  Path: "Path",
  Rect: "Rect",
}));
vi.mock("../../components", () => ({ ConvoScreen: "ConvoScreen" }));

import { DISCOVERY_OPTIONS } from "./DiscoverySourceScreen";

describe("DISCOVERY_OPTIONS", () => {
  it("keeps Nick's order, with Reddit third on volume", () => {
    expect(DISCOVERY_OPTIONS.map((o) => o.value)).toEqual([
      "app_store",
      "friends",
      "reddit",
      "facebook",
      "instagram",
      "tiktok",
      "youtube",
      "other",
    ]);
    expect(DISCOVERY_OPTIONS[0]!.label).toBe("App Store search");
    expect(DISCOVERY_OPTIONS.at(-1)!.label).toBe("Somewhere else");
  });

  it("offers a row for every channel the backend accepts", () => {
    // The gap this closes: a value the server would happily store but the
    // screen never asks about is a channel silently collapsed into
    // "Somewhere else", which is exactly how Reddit read as zero for months.
    expect([...DISCOVERY_OPTIONS.map((o) => o.value)].sort()).toEqual(
      [...discoverySourceSchema.options].sort(),
    );
  });

  it("gives EVERY row a mark, catch-all included", () => {
    // Reversed deliberately. This asserted the catch-all had none, which was
    // fine in the wrapping chip grid where nothing aligned anyway. In a column
    // it means the last row starts at its label while all seven above start at
    // a tile, so the left edge breaks on the final line.
    for (const option of DISCOVERY_OPTIONS) expect(option.leading).toBeTruthy();
  });

  it("labels no option with a word the user has to decode", () => {
    // Every label is either a brand the user already recognises or plain
    // English. "App Store search" is distinct from browsing it, on purpose.
    for (const option of DISCOVERY_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.label).not.toMatch(/_/);
    }
  });
});
