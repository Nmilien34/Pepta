// The Health-sync decision, pinned before any native code exists.
//
// The rule under test: HEALTH OWNS EXACTLY ONE ROW PER LOCAL DAY, AND ONLY
// EVER ITS OWN. Every failure mode here has a twin that already shipped
// somewhere this session — the resistance pile-up (create per sync), the
// evening timezone collapse (UTC day bucketing), the ghost chips (rows the
// user cannot attribute). These exist so the sync cannot repeat them.

import { describe, expect, it } from 'vitest';
import {
  HEALTH_NOTE,
  healthRowForDay,
  healthSyncDecision,
  middayOf,
  type ActivityRowLike,
} from './healthDay';

/** 9pm local — the hour UTC bucketing files under tomorrow. */
const NOW = new Date(2026, 7, 24, 21, 0, 0);
const TODAY_NOON = new Date(2026, 7, 24, 12, 0, 0).toISOString();

const healthRow = (over: Partial<ActivityRowLike> = {}): ActivityRowLike => ({
  id: 'h1',
  datetime: TODAY_NOON,
  deletedAt: null,
  steps: 4000,
  resistanceTraining: false,
  notes: HEALTH_NOTE,
  ...over,
});

describe('an empty day writes nothing', () => {
  it('no-ops on all zeroes', () => {
    // An all-zero row would light the streak and Today's Log for a phone
    // that sat on a desk all day.
    expect(healthSyncDecision({ steps: 0, workoutMinutes: 0, hadStrength: false }, [], NOW)).toEqual(
      { kind: 'none' },
    );
  });
});

describe('first sync of the day creates', () => {
  it('creates with provenance and the day filed at local noon', () => {
    const d = healthSyncDecision({ steps: 5200, workoutMinutes: 0, hadStrength: false }, [], NOW);

    expect(d.kind).toBe('create');
    if (d.kind !== 'create') return;
    expect(d.payload.notes).toBe(HEALTH_NOTE);
    expect(d.payload.steps).toBe(5200);
    // Noon local, not the sync instant: an 11:58pm sync must not race
    // midnight and land the day's steps on tomorrow.
    expect(d.payload.datetime).toBe(TODAY_NOON);
  });

  it('a strength workout flips the resistance marker', () => {
    const d = healthSyncDecision({ steps: 0, workoutMinutes: 40, hadStrength: true }, [], NOW);

    expect(d.kind).toBe('create');
    if (d.kind !== 'create') return;
    expect(d.payload.resistanceTraining).toBe(true);
    expect(d.payload.workoutMinutes).toBe(40);
  });
});

describe('later syncs update the SAME row', () => {
  it('updates in place when the numbers grow', () => {
    // Steps grow all day. A create per sync is the resistance pile-up again,
    // and every consumer would double-count the day.
    const d = healthSyncDecision(
      { steps: 7100, workoutMinutes: 0, hadStrength: false },
      [healthRow({ steps: 4000 })],
      NOW,
    );

    expect(d).toMatchObject({ kind: 'update', id: 'h1' });
  });

  it('no-ops when nothing moved — foreground syncs must not spam', () => {
    const d = healthSyncDecision(
      { steps: 4000, workoutMinutes: 0, hadStrength: false },
      [healthRow({ steps: 4000 })],
      NOW,
    );

    expect(d).toEqual({ kind: 'none' });
  });
});

describe('health only ever touches its own row', () => {
  it('a manual row on the same day is not adopted', () => {
    // The user typed their own entry. Updating THEIRS would overwrite what
    // they said with what the phone guessed.
    const manual = healthRow({ id: 'm1', notes: undefined });
    const d = healthSyncDecision({ steps: 5000, workoutMinutes: 0, hadStrength: false }, [manual], NOW);

    expect(d.kind).toBe('create');
  });

  it('a note that merely mentions Apple Health is not ours either', () => {
    const chatty = healthRow({ id: 'm2', notes: 'imported from Apple Health maybe' });

    expect(healthRowForDay([chatty], '2026-08-24')).toBeNull();
  });

  it("yesterday's health row is not today's", () => {
    const yesterday = healthRow({ datetime: new Date(2026, 7, 23, 12, 0, 0).toISOString() });
    const d = healthSyncDecision({ steps: 3000, workoutMinutes: 0, hadStrength: false }, [yesterday], NOW);

    expect(d.kind).toBe('create');
  });

  it('a deleted health row is gone — deleting the sync row is how you opt a day out', () => {
    const removed = healthRow({ deletedAt: '2026-08-24T15:00:00.000Z' });
    const d = healthSyncDecision({ steps: 3000, workoutMinutes: 0, hadStrength: false }, [removed], NOW);

    // Creates a fresh row rather than resurrecting the deleted one. (The next
    // sync recreating a row the user deleted is a known sharp edge — the
    // service layer throttles, and the row is at least visibly Apple Health.)
    expect(d.kind).toBe('create');
  });
});

describe('the evening is still today', () => {
  it('buckets a 9pm sync on the local day', () => {
    // The exact hour that collapsed the server streak to zero before the tz
    // fix. NOW is 9pm local; the decision must file under the 24th.
    const d = healthSyncDecision({ steps: 100, workoutMinutes: 0, hadStrength: false }, [], NOW);

    expect(d.kind).toBe('create');
    if (d.kind !== 'create') return;
    expect(new Date(d.payload.datetime).getDate()).toBe(24);
  });
});

describe('middayOf', () => {
  it('is noon local on the named day', () => {
    const at = new Date(middayOf('2026-08-24'));

    expect(at.getHours()).toBe(12);
    expect(at.getDate()).toBe(24);
  });
});
