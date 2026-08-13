import { describe, expect, it } from "vitest";
import { MIN_NOTICE_MS, TRIAL_REMINDER_LEAD_MS, planTrialReminder } from "./trialReminder";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const inHours = (h: number) => new Date(NOW.getTime() + h * 3600_000).toISOString();

describe("planTrialReminder", () => {
  it("fires a full day before a 3-day trial converts", () => {
    const plan = planTrialReminder({ expirationISO: inHours(72), isTrial: true, now: NOW });
    expect(plan).not.toBeNull();
    expect(plan!.fireAt.toISOString()).toBe(inHours(48));
    expect(plan!.title).toBe("Hope you’re enjoying Pepta");
  });

  it("NAMES NO PRICE and offers no cancellation path", () => {
    // The old copy did both and read as a churn prompt 24h before the charge.
    // This is the whole point of the 2026-08-12 rewrite — if either creeps
    // back in, it is a product decision, not an accident.
    const plan = planTrialReminder({ expirationISO: inHours(72), isTrial: true, now: NOW });
    expect(plan!.body).not.toContain("$");
    expect(plan!.body).not.toMatch(/cancel|settings|renew|charge/i);
  });

  it("gives a reason to open the app", () => {
    const plan = planTrialReminder({ expirationISO: inHours(72), isTrial: true, now: NOW });
    expect(`${plan!.title} ${plan!.body}`).toMatch(/Pepta/);
    expect(plan!.body.length).toBeGreaterThan(20);
  });

  it("schedules nothing when the purchase was not a trial", () => {
    // A paying subscriber must never be told their "trial" is ending.
    expect(planTrialReminder({ expirationISO: inHours(720), isTrial: false, now: NOW })).toBeNull();
  });

  it("schedules nothing without a usable expiry", () => {
    for (const expirationISO of [null, undefined, "", "not-a-date"]) {
      expect(planTrialReminder({ expirationISO, isTrial: true, now: NOW })).toBeNull();
    }
  });

  it("schedules nothing once the window is too short to be a warning", () => {
    // Landing with the charge is not notice, it is noise.
    expect(planTrialReminder({ expirationISO: inHours(-1), isTrial: true, now: NOW })).toBeNull();
    const barelyLeft = new Date(NOW.getTime() + MIN_NOTICE_MS - 1000).toISOString();
    expect(planTrialReminder({ expirationISO: barelyLeft, isTrial: true, now: NOW })).toBeNull();
  });

  it("halves a short trial instead of skipping it", () => {
    // A 6-hour trial cannot get 24 hours' lead. It lands at 3 hours. The copy
    // no longer references timing at all, so it stays correct at any lead.
    const plan = planTrialReminder({ expirationISO: inHours(6), isTrial: true, now: NOW });
    expect(plan!.fireAt.toISOString()).toBe(inHours(3));
    expect(plan!.title).toBe("Hope you’re enjoying Pepta");
  });

  it("never schedules in the past", () => {
    for (const hours of [0.6, 1, 5, 23, 24, 25, 72, 336]) {
      const plan = planTrialReminder({ expirationISO: inHours(hours), isTrial: true, now: NOW });
      if (plan) expect(plan.fireAt.getTime()).toBeGreaterThan(NOW.getTime());
    }
  });

  it("caps the lead at one day however long the trial is", () => {
    const plan = planTrialReminder({ expirationISO: inHours(336), isTrial: true, now: NOW });
    const expiry = new Date(inHours(336)).getTime();
    expect(expiry - plan!.fireAt.getTime()).toBe(TRIAL_REMINDER_LEAD_MS);
  });
});
