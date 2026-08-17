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
