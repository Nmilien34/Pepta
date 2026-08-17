// Milestones — the moments Pep is allowed to celebrate. This is what makes
// the 'celebrating' mood reachable: buildPepMood has carried a cheer pose
// since the companion shipped, but nothing ever passed `milestone: true`.
//
// THE SAME SAFETY RULE AS MOODS APPLIES. A milestone is only ever the
// PRESENCE of something good. There is no "streak lost", no "back at it",
// nothing that acknowledges an absence — a reset streak simply stops being
// celebrated. Anything shaped like compliance pressure is a medical risk on
// a GLP-1 (shame → doubling up), not a growth lever.
//
// Each milestone fires ONCE per account+device: the seen-set is persisted and
// a key is marked the moment it is shown. Order matters — the first unseen
// milestone whose condition holds wins, and smaller marks come before bigger
// ones so someone who arrives at day 30 with day 7 unseen celebrates them in
// sequence (one per session) rather than skipping straight to the biggest.
//
// Pure and RN-free; the AsyncStorage I/O lives in services/pepMilestoneStore.

import type { HomeResponse } from '@pepta/shared';

export interface MilestoneFacts {
  /** setupProgress.unlocked — the day-one checklist is done. */
  setupUnlocked: boolean;
  streakDays: number;
}

export function milestoneFactsFrom(home: HomeResponse | null | undefined): MilestoneFacts {
  return {
    setupUnlocked: home?.setupProgress?.unlocked === true,
    streakDays: home?.streakDays ?? 0,
  };
}

export interface PepMilestone {
  key: string;
  /** Spoken in the companion bubble when it fires. Celebration, never a nudge. */
  line: string;
  emoji: string;
  when(facts: MilestoneFacts): boolean;
}

export const PEP_MILESTONES: readonly PepMilestone[] = [
  {
    key: 'setup_unlocked',
    line: 'That’s your setup done. From here I get smarter with every log.',
    emoji: '🎉',
    when: (f) => f.setupUnlocked,
  },
  {
    // Three days is where the habit either takes or does not. It is also the
    // first mark most people ever reach, which is why the review ask rides
    // this one rather than streak_7 — see services/reviewPrompt.
    key: 'streak_3',
    line: 'Three days in a row. That’s the part most people never get past.',
    emoji: '✨',
    when: (f) => f.streakDays >= 3,
  },
  {
    key: 'streak_7',
    line: 'Seven days straight. That’s a real streak now.',
    emoji: '🔥',
    when: (f) => f.streakDays >= 7,
  },
  {
    key: 'streak_30',
    line: 'Thirty days. A full month of showing up — that’s the whole game.',
    emoji: '🏆',
    when: (f) => f.streakDays >= 30,
  },
];

/** The first unseen milestone whose condition holds, or null. */
export function dueMilestone(
  facts: MilestoneFacts,
  seen: ReadonlySet<string>,
): PepMilestone | null {
  for (const milestone of PEP_MILESTONES) {
    if (!seen.has(milestone.key) && milestone.when(facts)) return milestone;
  }
  return null;
}

/**
 * Seen-set (de)serialization. Corrupt input reads as "nothing seen" — the
 * worst case is one repeated celebration, which beats throwing in render.
 */
export function parseSeenMilestones(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((k): k is string => typeof k === 'string'));
    }
  } catch {
    // fall through
  }
  return new Set();
}

export function serializeSeenMilestones(seen: ReadonlySet<string>): string {
  return JSON.stringify([...seen]);
}
