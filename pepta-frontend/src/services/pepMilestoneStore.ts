// AsyncStorage half of the milestone system — the pure logic (which milestone
// is due, how the seen-set serializes) lives in screens/app/pepMilestones.
// Same defensive posture as companionNameStore: storage failures degrade to
// "nothing seen" / "best effort write", never to a throw in the companion.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  parseSeenMilestones,
  serializeSeenMilestones,
} from '../screens/app/pepMilestones';

/** Versioned so a future re-think can invalidate cleanly. */
export const PEP_MILESTONES_KEY = 'pepta:pep-milestones.v1';

export async function readSeenMilestones(): Promise<Set<string>> {
  try {
    return parseSeenMilestones(await AsyncStorage.getItem(PEP_MILESTONES_KEY));
  } catch {
    return new Set();
  }
}

export async function markMilestoneSeen(key: string): Promise<void> {
  try {
    const seen = parseSeenMilestones(await AsyncStorage.getItem(PEP_MILESTONES_KEY));
    seen.add(key);
    await AsyncStorage.setItem(PEP_MILESTONES_KEY, serializeSeenMilestones(seen));
  } catch {
    // Best effort: a failed write means one repeated celebration someday,
    // which is a better failure than blocking the companion.
  }
}
