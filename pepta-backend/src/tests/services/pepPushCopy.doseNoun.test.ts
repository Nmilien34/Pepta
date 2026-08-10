// Route-aware push titles (2026-08-10): the backend cron scheduler composes
// real notifications too, so a pill user must not be told "shot time" here
// either. Route missing/undefined keeps today's wording exactly.

import { describe, expect, it } from "vitest";
import { doseNoun } from "../../lib/dose-noun";

describe("doseNoun (backend)", () => {
  it("mirrors the frontend helper exactly", () => {
    expect(doseNoun("oral")).toBe("dose");
    expect(doseNoun("injection")).toBe("shot");
    expect(doseNoun(undefined)).toBe("shot");
    expect(doseNoun(null)).toBe("shot");
  });

  it("composes the two dose titles", () => {
    expect(`Pep: ${doseNoun("oral")} time`).toBe("Pep: dose time");
    expect(`Pep: post-${doseNoun("oral")} check-in`).toBe("Pep: post-dose check-in");
    expect(`Pep: ${doseNoun("injection")} time`).toBe("Pep: shot time");
    expect(`Pep: post-${doseNoun(undefined)} check-in`).toBe("Pep: post-shot check-in");
  });
});
