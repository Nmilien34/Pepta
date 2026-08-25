// The muscle-floor give, and the three-screen chain it sits in the middle of.
//
// The screen itself is a CitedStat and a Pep bubble — little to break. What IS
// breakable is the chain: heightWeight collects a weight, this screen derives a
// floor FROM it, and startWeight then echoes that floor back. Two of those
// numbers are computed in different files, so the thing worth pinning is that
// they can never disagree.

import { describe, expect, it } from "vitest";
import { proteinFloorG } from "../../utils/planPreview";
import { echoFor } from "./onboardingEcho";
import { shouldSkipStep } from "./onboardingFlow";

const imperial = { body: { heightIn: 70, weight: 226, units: "imperial" as const } };
const metric = { body: { heightCm: 178, weight: 102, units: "metric" as const } };

describe("the floor comes from their weight", () => {
  it("derives 158 g from 226 lb", () => {
    // 0.7 g per lb — the muscle-protective end, which is what makes it a floor.
    expect(proteinFloorG(226, "lb")).toBe(158);
  });

  it("converts before multiplying, so a metric user is not shortchanged", () => {
    // 102 kg is 225 lb. Multiplying 102 by 0.7 would prescribe 71 g — less than
    // half of what the same person needs.
    expect(proteinFloorG(102, "kg")).toBe(157);
    expect(proteinFloorG(102, "kg")).toBeGreaterThan(140);
  });
});

describe("the chain holds: their answer in, the same number out both sides", () => {
  it("echoes the body they just entered", () => {
    expect(echoFor("muscleFloor", imperial as never)).toMatch(/226 today\./);
  });

  it("hands the SAME figure to the next screen's echo", () => {
    // The failure this prevents: the screen says 158 g and startWeight echoes a
    // different number one tap later, because the two are computed in
    // different files off different units.
    const shown = proteinFloorG(imperial.body.weight, "lb");
    expect(echoFor("startWeight", imperial as never)).toBe(`${shown} g a day. Locked in.`);
  });

  it("holds in metric too", () => {
    const shown = proteinFloorG(metric.body.weight, "kg");
    expect(echoFor("startWeight", metric as never)).toBe(`${shown} g a day. Locked in.`);
  });

  it("no longer repeats the body line on startWeight", () => {
    // It moved to muscleFloor; leaving it would say the same thing twice, one
    // screen apart.
    expect(echoFor("startWeight", imperial as never)).not.toMatch(/today\./);
  });
});

describe("no body, no floor", () => {
  it("skips rather than deriving a number from the default body", () => {
    expect(shouldSkipStep("muscleFloor", { hasBody: false })).toBe(true);
    expect(shouldSkipStep("muscleFloor", {})).toBe(true);
    expect(shouldSkipStep("muscleFloor", { hasBody: true })).toBe(false);
  });
});
