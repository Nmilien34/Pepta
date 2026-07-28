import { describe, expect, it } from "vitest";
import { MIN_NOTICE_MS, TRIAL_REMINDER_LEAD_MS, planTrialReminder } from "./trialReminder";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const inHours = (h: number) => new Date(NOW.getTime() + h * 3600_000).toISOString();

describe("planTrialReminder", () => {
  it("fires a full day before a 3-day trial converts", () => {
    const plan = planTrialReminder({ expirationISO: inHours(72), isTrial: true, now: NOW });
    expect(plan).not.toBeNull();
    expect(plan!.fireAt.toISOString()).toBe(inHours(48));
    expect(plan!.title).toBe("Your free trial ends tomorrow");
  });

  it("names the price they are about to be charged", () => {
    const plan = planTrialReminder({
      expirationISO: inHours(72),
      isTrial: true,
      priceString: "$9.99",
      now: NOW,
    });
    expect(plan!.body).toContain("$9.99");
    expect(plan!.body).toContain("cancel in Settings");
  });

  it("stays vague when it cannot say the price", () => {
    // Better a soft reminder than a confident wrong number.
    const plan = planTrialReminder({ expirationISO: inHours(72), isTrial: true, now: NOW });
    expect(plan!.body).not.toContain("$");
    expect(plan!.body).toContain("tomorrow");
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

  it("halves a short trial instead of skipping it, and stops saying tomorrow", () => {
    // A 6-hour trial cannot get 24 hours' notice. It gets 3 hours — and the
    // copy must not promise "tomorrow" when it will fire the same day.
    const plan = planTrialReminder({ expirationISO: inHours(6), isTrial: true, now: NOW });
    expect(plan!.fireAt.toISOString()).toBe(inHours(3));
    expect(plan!.title).toBe("Your free trial ends soon");
    expect(plan!.body).toContain("soon");
    expect(plan!.body).not.toContain("tomorrow");
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
