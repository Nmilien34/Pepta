// The formatter cache is fed directly from a request query string
// (GET /home?tz=…), so its keying is an availability question, not a tidiness
// one. Intl accepts any casing of a valid zone, and the cache used to key on
// the raw string — so one client could mint unlimited permanent entries.

import { describe, expect, it } from "vitest";
import {
  cachedFormatterCountForTests,
  dateOnlyInTz,
  isValidTimeZone,
} from "../../lib/timezone";

describe("the timezone formatter cache", () => {
  it("collapses every spelling of a zone onto one entry", () => {
    const before = cachedFormatterCountForTests();
    const spellings = [
      "America/New_York",
      "america/new_york",
      "AMERICA/NEW_YORK",
      "AmErIcA/nEw_YoRk",
      "America/New_york",
    ];

    for (const spelling of spellings) {
      expect(isValidTimeZone(spelling)).toBe(true);
    }

    // One canonical zone, one formatter — not five.
    expect(cachedFormatterCountForTests() - before).toBeLessThanOrEqual(1);
  });

  it("stays bounded under a flood of distinct valid spellings", () => {
    const before = cachedFormatterCountForTests();
    // 200 distinct casings of ONE real zone — the attack shape.
    for (let i = 0; i < 200; i += 1) {
      const spelling = "America/New_York"
        .split("")
        .map((ch, index) => ((i >> index % 8) & 1 ? ch.toUpperCase() : ch.toLowerCase()))
        .join("");
      isValidTimeZone(spelling);
    }

    expect(cachedFormatterCountForTests() - before).toBeLessThanOrEqual(1);
  });

  it("still rejects an unusable zone and caches nothing for it", () => {
    const before = cachedFormatterCountForTests();

    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);

    expect(cachedFormatterCountForTests()).toBe(before);
  });

  it("still formats correctly through the canonical entry", () => {
    // Behaviour must be unchanged — a lowercase zone resolves the same day.
    const at = new Date("2026-08-21T03:00:00.000Z");
    expect(dateOnlyInTz(at, "america/new_york")).toBe("2026-08-20");
    expect(dateOnlyInTz(at, "America/New_York")).toBe("2026-08-20");
  });
});
