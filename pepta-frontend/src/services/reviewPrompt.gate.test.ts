// App Review 5.6.3, rejection of 2026-08-28:
// "The app requests users to rate the app on first launch or during
//  onboarding, before they've had enough time to gain a clear understanding
//  of the app's value."
//
// HOW IT HAPPENED, and it was not a naive first-launch call. The ask already
// rode an earned milestone (streak_3). But every gate was derived from ACCOUNT
// data, and seedDemoUser gives the review account weeks of backdated history:
// onboardingCompletedAt is WEEKS*7 days ago and its dose logs go back just as
// far. So the reviewer installed fresh, signed in, and the home payload
// immediately reported a streak — dueMilestone fired on the first render and
// took the rating sheet with it.
//
// The fix is that the gates are now DEVICE-LOCAL. Days since first open on
// THIS install cannot be backdated by any account, which is why that single
// condition makes a first-launch ask structurally impossible.
import { describe, expect, it } from 'vitest';
import {
  MIN_DAYS_SINCE_FIRST_OPEN,
  MIN_LOGGED_DAYS,
  REVIEW_COOLDOWN_DAYS,
  reviewGateDecision,
} from './reviewPrompt';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 28, 12);

const base = {
  now: NOW,
  firstOpenAt: NOW - 10 * DAY,
  loggedDays: ['2026-08-20', '2026-08-22', '2026-08-25'],
  onboardingActive: false,
  lastAskedAt: null,
  available: true,
};

describe('the review ask cannot fire before the app has been used', () => {
  it('asks when every condition is met', () => {
    expect(reviewGateDecision(base)).toBe('ask');
  });

  // The condition that makes the rejection structurally impossible.
  it('can NEVER qualify on first launch, whatever the account says', () => {
    // A freshly installed device signing into the seeded review account: weeks
    // of logged days arrive from the server, but this install is seconds old.
    const reviewerFirstLaunch = {
      ...base,
      firstOpenAt: NOW,
      loggedDays: Array.from({ length: 40 }, (_, i) => `2026-07-${String(i % 28 + 1).padStart(2, '0')}`),
    };
    expect(reviewGateDecision(reviewerFirstLaunch)).toBe('too-new');
  });

  it('holds below the day threshold and releases at it', () => {
    const dayBefore = { ...base, firstOpenAt: NOW - (MIN_DAYS_SINCE_FIRST_OPEN - 1) * DAY };
    expect(reviewGateDecision(dayBefore)).toBe('too-new');
    const atThreshold = { ...base, firstOpenAt: NOW - MIN_DAYS_SINCE_FIRST_OPEN * DAY };
    expect(reviewGateDecision(atThreshold)).toBe('ask');
  });

  it('counts DISTINCT days, so one heavy session cannot qualify', () => {
    const oneBusyDay = { ...base, loggedDays: ['2026-08-25'] };
    expect(reviewGateDecision(oneBusyDay)).toBe('not-enough-days');
    // Duplicates of the same day collapse.
    const repeated = { ...base, loggedDays: ['2026-08-25', '2026-08-25', '2026-08-25'] };
    expect(reviewGateDecision(repeated)).toBe('not-enough-days');
    const enough = {
      ...base,
      loggedDays: Array.from({ length: MIN_LOGGED_DAYS }, (_, i) => `2026-08-1${i}`),
    };
    expect(reviewGateDecision(enough)).toBe('ask');
  });

  it('never asks while onboarding is on screen', () => {
    expect(reviewGateDecision({ ...base, onboardingActive: true })).toBe('onboarding-active');
  });

  it('respects the cooldown, then releases after it', () => {
    const recent = { ...base, lastAskedAt: NOW - (REVIEW_COOLDOWN_DAYS - 1) * DAY };
    expect(reviewGateDecision(recent)).toBe('cooldown');
    const expired = { ...base, lastAskedAt: NOW - REVIEW_COOLDOWN_DAYS * DAY };
    expect(reviewGateDecision(expired)).toBe('ask');
  });

  it('declines when the system sheet is unavailable', () => {
    expect(reviewGateDecision({ ...base, available: false })).toBe('unavailable');
  });

  it('treats an unknown first-open as too new rather than assuming', () => {
    // A missing marker must never be read as "installed long ago".
    expect(reviewGateDecision({ ...base, firstOpenAt: null })).toBe('too-new');
  });
});
