// The streak is the app's main retention hook, and it was the one number on
// Home bucketed in UTC while every total beside it uses the user's local day.
//
// For anyone west of UTC that means the streak collapses every evening: after
// 5pm Pacific the UTC date has already rolled over, so "today" has no logs in
// it yet and the walk-back terminates immediately at 0 — while the protein and
// water rings on the same screen still show today's entries.

import { describe, expect, it } from "vitest";
import { consecutiveActivityStreak } from "../../lib/streak";

const LA = "America/Los_Angeles";

/** 08:00 local on the given LA date, expressed as UTC. */
function morningInLA(day: string): string {
  return new Date(`${day}T15:00:00.000Z`).toISOString(); // 08:00 PDT
}

describe("the streak follows the user's day", () => {
  it("still counts today at 8pm local, when UTC has already rolled over", () => {
    // 03:00 UTC on the 20th IS 8pm on the 19th in Los Angeles.
    const evening = new Date("2026-08-20T03:00:00.000Z");
    const logs = [
      { datetime: morningInLA("2026-08-19") },
      { datetime: morningInLA("2026-08-18") },
      { datetime: morningInLA("2026-08-17") },
    ];

    expect(consecutiveActivityStreak(logs, evening, LA)).toBe(3);
  });

  it("counts the same run at midday local, before UTC rolls over", () => {
    const midday = new Date("2026-08-19T19:00:00.000Z"); // 12:00 PDT
    const logs = [
      { datetime: morningInLA("2026-08-19") },
      { datetime: morningInLA("2026-08-18") },
      { datetime: morningInLA("2026-08-17") },
    ];

    expect(consecutiveActivityStreak(logs, midday, LA)).toBe(3);
  });

  it("breaks the run on a genuinely missed local day", () => {
    const evening = new Date("2026-08-20T03:00:00.000Z");
    const logs = [
      { datetime: morningInLA("2026-08-19") },
      // 18th missed.
      { datetime: morningInLA("2026-08-17") },
    ];

    expect(consecutiveActivityStreak(logs, evening, LA)).toBe(1);
  });

  it("reads zero when the user has not logged today", () => {
    const evening = new Date("2026-08-20T03:00:00.000Z");
    const logs = [{ datetime: morningInLA("2026-08-18") }];

    expect(consecutiveActivityStreak(logs, evening, LA)).toBe(0);
  });

  it("keeps the old UTC behaviour when no timezone is known", () => {
    const midday = new Date("2026-08-19T19:00:00.000Z");
    const logs = [{ datetime: "2026-08-19T19:00:00.000Z" }];

    expect(consecutiveActivityStreak(logs, midday)).toBe(1);
  });
});
