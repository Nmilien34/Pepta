// The timeline must be data-driven end to end: day numbers from the loaded
// intro offer, the charge date from the clock — the trial length has an
// Apple-side expiry and may change, so nothing may be baked in.

import { describe, expect, it } from "vitest";
import { buildTrialTimeline, freeStartHeadline, trialTermSlides, trialTotalDays } from "./paywallTimeline";

const NOW = new Date(2026, 6, 31); // Jul 31

describe("buildTrialTimeline", () => {
  it("renders today / day 2 reminder / day 3 charge with the real date for a 3-day trial", () => {
    const rows = buildTrialTimeline({ periodNumberOfUnits: 3, periodUnit: "DAY" }, NOW);
    expect(rows.map((r) => r.key)).toEqual(["today", "reminder", "charge"]);
    expect(rows[1]!.day).toBe("Day 2");
    expect(rows[2]!.day).toBe("Day 3");
    expect(rows[2]!.title).toBe("First charge — Aug 3");
  });

  it("scales to a 1-week trial: reminder day 6, charge day 7", () => {
    const rows = buildTrialTimeline({ periodNumberOfUnits: 1, periodUnit: "WEEK" }, NOW);
    expect(rows[1]!.day).toBe("Day 6");
    expect(rows[2]!.day).toBe("Day 7");
    expect(rows[2]!.title).toBe("First charge — Aug 7");
  });

  it("omits the reminder row for a 1-day trial instead of promising one it can't keep", () => {
    const rows = buildTrialTimeline({ periodNumberOfUnits: 1, periodUnit: "DAY" }, NOW);
    expect(rows.map((r) => r.key)).toEqual(["today", "charge"]);
    expect(rows[1]!.day).toBe("Day 1");
  });

  it("crosses month boundaries correctly", () => {
    const rows = buildTrialTimeline(
      { periodNumberOfUnits: 3, periodUnit: "DAY" },
      new Date(2026, 11, 30), // Dec 30 → charge Jan 2
    );
    expect(rows[2]!.title).toBe("First charge — Jan 2");
  });
});

describe("trialTotalDays / freeStartHeadline", () => {
  it("converts units and stays grammatical", () => {
    expect(trialTotalDays({ periodNumberOfUnits: 3, periodUnit: "DAY" })).toBe(3);
    expect(trialTotalDays({ periodNumberOfUnits: 2, periodUnit: "WEEK" })).toBe(14);
    expect(freeStartHeadline({ periodNumberOfUnits: 3, periodUnit: "DAY" })).toBe(
      "Your 3 free days start now",
    );
    expect(freeStartHeadline({ periodNumberOfUnits: 1, periodUnit: "WEEK" })).toBe(
      "Your free week starts now",
    );
  });
});

describe("trialTermSlides", () => {
  it("compresses the timeline into derived one-line slides", () => {
    const slides = trialTermSlides(
      { periodNumberOfUnits: 3, periodUnit: "DAY" },
      new Date(2026, 7, 5), // Aug 5 → charge Aug 8
    );
    expect(slides.map((s) => s.key)).toEqual(["today", "reminder", "charge"]);
    expect(slides[0]!.label).toBe("Free today — full access");
    expect(slides[1]!.label).toBe("Day 2 — we remind you");
    expect(slides[2]!.label).toBe("Day 3 — first charge, Aug 8");
  });

  it("derives the day numbers from the product, never a literal 3", () => {
    const slides = trialTermSlides(
      { periodNumberOfUnits: 1, periodUnit: "WEEK" },
      new Date(2026, 7, 5), // Aug 5 → charge Aug 12
    );
    expect(slides[1]!.label).toBe("Day 6 — we remind you");
    expect(slides[2]!.label).toBe("Day 7 — first charge, Aug 12");
  });

  it("omits the reminder slide for a one-day trial, same rule as the timeline", () => {
    const slides = trialTermSlides(
      { periodNumberOfUnits: 1, periodUnit: "DAY" },
      new Date(2026, 7, 5),
    );
    expect(slides.map((s) => s.key)).toEqual(["today", "charge"]);
  });
});
