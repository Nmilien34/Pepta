// The decision half of Apple Health sync — pure, so it tests in node.
//
// Health sync is a WRITER into the same activity-log pipeline the manual
// sheet uses, and this module decides what it writes. One rule shapes it:
//
//   HEALTH OWNS EXACTLY ONE ROW PER LOCAL DAY, AND ONLY EVER ITS OWN.
//
// Steps grow all day, so the row must be UPDATED in place rather than
// re-created — a create per sync would pile rows the way the resistance
// pile-up did, and every consumer of activity logs would double-count.
// Manual rows are never touched: a user who types their gym session on top
// of a synced day is adding information, not correcting ours.
//
// Provenance is the notes field, HEALTH_NOTE. Deliberately NOT a schema
// change: response schemas are strict and shipped clients throw on unknown
// fields (the tz-param precedent), so a new `source` field would break every
// installed build. notes already exists end to end, survives the round trip,
// and is visible to a human wondering where the row came from.
//
// Day bucketing is DEVICE-LOCAL, the same localDay rule the feed, the
// streaks and the server's own streak fix all settled on. Health data is
// queried per local day, so the row it lands in must be filed under the
// same calendar day or the sync disagrees with every card beside it.

import { localDay } from '../screens/app/activityFeed';

/** The provenance marker. Matching is exact — a user note that merely
 *  mentions Apple Health must not make us adopt their row. */
export const HEALTH_NOTE = 'Apple Health';

export interface HealthSnapshot {
  /** Cumulative steps for the local day, from HealthKit. */
  steps: number;
  /** Total workout minutes for the local day. */
  workoutMinutes: number;
  /** Whether any workout was a strength type — flips the resistance marker. */
  hadStrength: boolean;
}

export interface ActivityRowLike {
  id: string;
  datetime: string;
  deletedAt?: string | null;
  steps?: number;
  workoutMinutes?: number;
  resistanceTraining?: boolean;
  notes?: string;
}

export type HealthSyncDecision =
  | { kind: 'none' }
  | { kind: 'create'; payload: HealthWritePayload }
  | { kind: 'update'; id: string; payload: HealthWritePayload };

export interface HealthWritePayload {
  steps?: number;
  workoutMinutes?: number;
  resistanceTraining: boolean;
  datetime: string;
  notes: typeof HEALTH_NOTE;
}

/** The Health-owned row for a given local day, if one exists. */
export function healthRowForDay(
  rows: readonly ActivityRowLike[],
  day: string,
): ActivityRowLike | null {
  return (
    rows.find(
      (row) =>
        row.deletedAt == null &&
        row.notes === HEALTH_NOTE &&
        localDay(row.datetime) === day,
    ) ?? null
  );
}

/**
 * What to write, given today's Health numbers and the rows we already hold.
 *
 * - Nothing measured → nothing written. An all-zero row would light the
 *   streak and the Today's Log for a phone that sat on a desk.
 * - No Health row yet → create one.
 * - A Health row exists → update it ONLY when a number actually moved;
 *   otherwise no-op, so foreground-triggered syncs don't spam the server.
 */
export function healthSyncDecision(
  snapshot: HealthSnapshot,
  rows: readonly ActivityRowLike[],
  now: Date,
): HealthSyncDecision {
  const day = localDay(now.toISOString());
  const measured =
    snapshot.steps > 0 || snapshot.workoutMinutes > 0 || snapshot.hadStrength;
  if (!measured) return { kind: 'none' };

  const payload: HealthWritePayload = {
    ...(snapshot.steps > 0 ? { steps: Math.round(snapshot.steps) } : {}),
    ...(snapshot.workoutMinutes > 0
      ? { workoutMinutes: Math.round(snapshot.workoutMinutes) }
      : {}),
    resistanceTraining: snapshot.hadStrength,
    // Noon local, not `now`: the row represents the DAY. Filing it at the
    // sync instant would let an 11:58pm sync race midnight and land the
    // day's steps on tomorrow.
    datetime: middayOf(day),
    notes: HEALTH_NOTE,
  };

  const mine = healthRowForDay(rows, day);
  if (!mine) return { kind: 'create', payload };

  const unchanged =
    (mine.steps ?? 0) === (payload.steps ?? 0) &&
    (mine.workoutMinutes ?? 0) === (payload.workoutMinutes ?? 0) &&
    (mine.resistanceTraining ?? false) === payload.resistanceTraining;
  if (unchanged) return { kind: 'none' };

  return { kind: 'update', id: mine.id, payload };
}

/** Noon on a local calendar day, as an ISO instant. */
export function middayOf(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year!, (month ?? 1) - 1, date ?? 1, 12, 0, 0).toISOString();
}
