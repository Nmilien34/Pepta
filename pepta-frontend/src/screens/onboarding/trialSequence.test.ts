import { describe, expect, it } from "vitest";
import {
  DAY_ONE_LOCAL_HOUR,
  MIN_ROOM_BEFORE_EXPIRY_MS,
  READY_DELAY_MS,
  TRIAL_SEQUENCE_IDS,
  planTrialSequence,
} from "./trialSequence";

// 10:00 local on the purchase day, so the evening step lands the same calendar
// week regardless of the machine's zone.
const NOW = new Date(2026, 7, 12, 10, 0, 0);
const inHours = (h: number) => new Date(NOW.getTime() + h * 3600_000).toISOString();

describe("planTrialSequence", () => {
  it("schedules both touchpoints across a 3-day trial", () => {
    const steps = planTrialSequence({ expirationISO: inHours(72), isTrial: true, now: NOW });
    expect(steps.map((s) => s.id)).toEqual([
      TRIAL_SEQUENCE_IDS.ready,
      TRIAL_SEQUENCE_IDS.dayOne,
    ]);
  });

  it("lands the first one a few hours after purchase, not immediately", () => {
    // Firing on the heels of the purchase sheet reads as a double-tap.
    const [ready] = planTrialSequence({ expirationISO: inHours(72), isTrial: true, now: NOW });
    expect(ready!.fireAt.getTime()).toBe(NOW.getTime() + READY_DELAY_MS);
  });

  it("puts day one in the evening, clear of the 11:30 and 15:30 reminders", () => {
    const steps = planTrialSequence({ expirationISO: inHours(72), isTrial: true, now: NOW });
    const dayOne = steps.find((s) => s.id === TRIAL_SEQUENCE_IDS.dayOne)!;
    expect(dayOne.fireAt.getHours()).toBe(DAY_ONE_LOCAL_HOUR);
    // A full day after purchase, not the same evening.
    expect(dayOne.fireAt.getDate()).toBe(new Date(NOW).getDate() + 1);
  });

  it("fires in order and never after the trial is over", () => {
    const steps = planTrialSequence({ expirationISO: inHours(72), isTrial: true, now: NOW });
    const expiry = new Date(inHours(72)).getTime();
    let previous = NOW.getTime();
    for (const step of steps) {
      expect(step.fireAt.getTime()).toBeGreaterThan(previous);
      expect(step.fireAt.getTime()).toBeLessThan(expiry);
      previous = step.fireAt.getTime();
    }
  });

  it("NEVER assumes the user has logged a dose", () => {
    // Copy is frozen at purchase time and fired days later, so a line like
    // "log your first dose" would be wrong for anyone who already had.
    const steps = planTrialSequence({ expirationISO: inHours(72), isTrial: true, now: NOW });
    for (const step of steps) {
      expect(`${step.title} ${step.body}`).not.toMatch(/your first|start tracking|haven't/i);
    }
  });

  it("names no price and offers no cancellation path", () => {
    const steps = planTrialSequence({ expirationISO: inHours(72), isTrial: true, now: NOW });
    for (const step of steps) {
      expect(step.body).not.toContain("$");
      expect(`${step.title} ${step.body}`).not.toMatch(/cancel|settings|renew|charge|trial ends/i);
    }
  });

  it("schedules nothing when the purchase was not a trial", () => {
    expect(planTrialSequence({ expirationISO: inHours(720), isTrial: false, now: NOW })).toEqual([]);
  });

  it("schedules nothing without a usable expiry", () => {
    for (const expirationISO of [null, undefined, "", "not-a-date"]) {
      expect(planTrialSequence({ expirationISO, isTrial: true, now: NOW })).toEqual([]);
    }
  });

  it("drops steps that would land too close to the charge rather than bunching them", () => {
    // An 8-hour trial has room for the 3-hour nudge and nothing else.
    const steps = planTrialSequence({ expirationISO: inHours(12), isTrial: true, now: NOW });
    expect(steps.map((s) => s.id)).toEqual([TRIAL_SEQUENCE_IDS.ready]);
  });

  it("schedules nothing at all when the window is shorter than the first step", () => {
    const steps = planTrialSequence({ expirationISO: inHours(4), isTrial: true, now: NOW });
    expect(steps).toEqual([]);
  });

  it("leaves room before expiry for the day-2 message to land first", () => {
    const steps = planTrialSequence({ expirationISO: inHours(72), isTrial: true, now: NOW });
    const expiry = new Date(inHours(72)).getTime();
    for (const step of steps) {
      expect(expiry - step.fireAt.getTime()).toBeGreaterThanOrEqual(MIN_ROOM_BEFORE_EXPIRY_MS);
    }
  });
});
