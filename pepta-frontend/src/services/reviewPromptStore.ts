// AsyncStorage half of the review ask — the decision logic lives in
// services/reviewPrompt. Same defensive posture as pepMilestoneStore: a
// storage failure degrades to "already asked", never to a throw.
//
// The failure direction is deliberate. If we cannot read the flag we assume we
// HAVE asked, so a broken read costs one missed prompt rather than a repeated
// one — and iOS only grants three a year.

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Versioned so a future re-think can invalidate cleanly. */
export const REVIEW_ASKED_KEY = 'pepta:review-asked.v1';
/** First launch on THIS install — the marker no account can backdate. */
export const FIRST_OPEN_KEY = 'pepta:first-open.v1';
/** Distinct local YYYY-MM-DD days on which the user logged something. */
export const LOGGED_DAYS_KEY = 'pepta:logged-days.v1';
/** Days beyond this are dropped: the gate only needs a small distinct count. */
const MAX_LOGGED_DAYS_KEPT = 30;

export async function hasAskedForReview(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(REVIEW_ASKED_KEY)) != null;
  } catch {
    return true;
  }
}

export async function markReviewAsked(now: Date = new Date()): Promise<void> {
  try {
    // The value is the timestamp rather than a bare flag: if we ever want a
    // second ask after a long gap, the data is already there.
    await AsyncStorage.setItem(REVIEW_ASKED_KEY, now.toISOString());
  } catch {
    // Best effort. A failed write means one repeated ask someday, which iOS
    // will itself drop if it is too soon.
  }
}

/**
 * Stamp the first launch, once. Returns the stored timestamp.
 *
 * WRITE-ONCE ON PURPOSE. Re-stamping on every launch would keep the install
 * permanently "new" and the ask would never fire; overwriting it later would
 * let a reinstall look old. Called from the app root.
 */
export async function recordFirstOpen(now: Date = new Date()): Promise<number | null> {
  try {
    const existing = await AsyncStorage.getItem(FIRST_OPEN_KEY);
    if (existing) {
      const parsed = Date.parse(existing);
      return Number.isNaN(parsed) ? null : parsed;
    }
    await AsyncStorage.setItem(FIRST_OPEN_KEY, now.toISOString());
    return now.getTime();
  } catch {
    // Unknown reads as "brand new" downstream, which fails CLOSED — the gate
    // treats a null first-open as too new to ask.
    return null;
  }
}

export async function firstOpenAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(FIRST_OPEN_KEY);
    if (!raw) return null;
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

export async function loggedDays(): Promise<readonly string[]> {
  try {
    const raw = await AsyncStorage.getItem(LOGGED_DAYS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === 'string') : [];
  } catch {
    // An empty list fails CLOSED: fewer distinct days means no ask.
    return [];
  }
}

/**
 * Record that the user logged something today. Idempotent per day — the gate
 * counts DISTINCT days, so one busy session must not look like a habit.
 */
export async function recordLoggedDay(day: string): Promise<void> {
  try {
    const existing = await loggedDays();
    if (existing.includes(day)) return;
    const next = [...existing, day].slice(-MAX_LOGGED_DAYS_KEPT);
    await AsyncStorage.setItem(LOGGED_DAYS_KEY, JSON.stringify(next));
  } catch {
    // Best effort: a lost day only delays the ask.
  }
}

export async function lastAskedAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(REVIEW_ASKED_KEY);
    if (!raw) return null;
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? null : parsed;
  } catch {
    // Unknown reads as "asked just now" downstream via the cooldown, matching
    // this module's standing bias toward one missed ask over a repeated one.
    return Date.now();
  }
}
