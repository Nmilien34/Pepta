// The discovery ask's option list: FIXED order by explicit call (Nick,
// 2026-08-06) — organic channels first because that's where users actually
// come from today, channels we're not on yet last among brands, and the
// "Somewhere else" catch-all always pinned to the end.

import { describe, expect, it, vi } from "vitest";

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
  it("keeps Nick's exact order: organic → FB/IG → TikTok/YouTube → catch-all", () => {
    expect(DISCOVERY_OPTIONS.map((o) => o.value)).toEqual([
      "app_store",
      "friends",
      "facebook",
      "instagram",
      "tiktok",
      "youtube",
      "other",
    ]);
    expect(DISCOVERY_OPTIONS[0]!.label).toBe("App Store search");
    expect(DISCOVERY_OPTIONS[6]!.label).toBe("Somewhere else");
  });

  it("gives every brand a leading logo and the catch-all none", () => {
    for (const option of DISCOVERY_OPTIONS.slice(0, 6)) expect(option.leading).toBeTruthy();
    expect(DISCOVERY_OPTIONS[6]!.leading).toBeUndefined();
  });
});
