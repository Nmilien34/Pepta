import { describe, expect, it } from 'vitest';
import {
  PEP_MILESTONES,
  dueMilestone,
  milestoneFactsFrom,
  parseSeenMilestones,
  serializeSeenMilestones,
} from './pepMilestones';

const facts = (over: Partial<{ setupUnlocked: boolean; streakDays: number }> = {}) => ({
  setupUnlocked: false,
  streakDays: 0,
  ...over,
});

describe('dueMilestone', () => {
  it('fires nothing for a brand-new account', () => {
    expect(dueMilestone(facts(), new Set())).toBeNull();
  });

  it('fires setup first, then the streaks in ascending order', () => {
    // Someone arriving at day 30 with nothing seen celebrates the marks in
    // sequence (one per session), not just the biggest.
    const f = facts({ setupUnlocked: true, streakDays: 30 });
    const seen = new Set<string>();
    const order: string[] = [];
    for (;;) {
      const due = dueMilestone(f, seen);
      if (!due) break;
      order.push(due.key);
      seen.add(due.key);
    }
    expect(order).toEqual(['setup_unlocked', 'streak_3', 'streak_7', 'streak_30']);
  });

  it('celebrates three days — the mark most installs actually reach', () => {
    const due = dueMilestone(facts({ setupUnlocked: true, streakDays: 3 }), new Set(['setup_unlocked']));
    expect(due?.key).toBe('streak_3');
  });

  it('never re-fires a seen milestone', () => {
    const f = facts({ setupUnlocked: true });
    expect(dueMilestone(f, new Set(['setup_unlocked']))).toBeNull();
  });

  it('celebrates presence only — a reset streak is silence, not a mood', () => {
    // THE safety rule, at the milestone layer: no definition may be able to
    // fire on an absence. Every condition must be monotonic in the facts —
    // false on the zero state, and never true on less than what it needs.
    const zero = facts();
    for (const m of PEP_MILESTONES) {
      expect(m.when(zero)).toBe(false);
      // and the copy never scolds
      for (const banned of ['miss', 'lost', 'broke', 'back at it', 'again', 'don’t']) {
        expect(m.line.toLowerCase()).not.toContain(banned);
      }
    }
    // A streak that reset from 29 to 0 simply stops matching — same as zero.
    expect(dueMilestone(facts({ streakDays: 0 }), new Set())).toBeNull();
  });
});

describe('milestoneFactsFrom', () => {
  it('reads home defensively', () => {
    expect(milestoneFactsFrom(null)).toEqual({ setupUnlocked: false, streakDays: 0 });
    expect(milestoneFactsFrom(undefined)).toEqual({ setupUnlocked: false, streakDays: 0 });
    expect(
      milestoneFactsFrom({ setupProgress: { unlocked: true }, streakDays: 8 } as never),
    ).toEqual({ setupUnlocked: true, streakDays: 8 });
  });
});

describe('seen-set serialization', () => {
  it('round-trips', () => {
    const seen = new Set(['setup_unlocked', 'streak_7']);
    expect(parseSeenMilestones(serializeSeenMilestones(seen))).toEqual(seen);
  });

  it('reads corrupt input as nothing seen instead of throwing', () => {
    for (const raw of [null, '', 'not json', '{}', '"str"', '[1,2]', 'null']) {
      const parsed = parseSeenMilestones(raw);
      expect([...parsed].every((k) => typeof k === 'string')).toBe(true);
      expect(parsed.size === 0 || raw === '[1,2]').toBe(true);
    }
  });
});
