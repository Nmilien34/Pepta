// "Your log" — one feed of everything the user actually recorded.
//
// WHY IT EXISTS: "Dose history" was the fifth card on Track, below the week
// strip, compounds, the site map and the curve. Someone who had just logged a
// shot scrolled past four cards to see it land. And it only ever showed doses,
// so weight, protein, water and side effects were invisible on the screen whose
// entire job is history.
//
// EVERY ROW IS A REAL RECORD. Nothing is derived, inferred or filled in: each
// entry maps to one document the user created, with that document's own
// timestamp. Soft-deleted rows are excluded everywhere — deletedAt is the only
// delete this app performs, so ignoring it would resurrect things people
// removed.
//
// Pure and RN-free.

import type { HomeResponse, TrackResponse } from '@pepta/shared';
import { doseNoun } from './levelSuppression';
// Reuse Track's own label helpers rather than inventing a second convention —
// the feed sits above the very cards these already label.
import { siteLabel, sideEffectTypeLabel } from './trackView';
import { measurementLabel } from './progressView';

export type ActivityKind =
  | 'dose'
  | 'weight'
  | 'protein'
  | 'water'
  | 'meal'
  | 'sideEffect'
  | 'activity'
  | 'measurement';

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  /** Loudest line: what it was. */
  title: string;
  /** Quieter line: the detail that makes it legible. Empty when there is none. */
  detail: string;
  datetime: string;
}

export interface ActivityDay {
  /** "Today" · "Yesterday" · "Mon, Aug 11" */
  label: string;
  /** YYYY-MM-DD in device-local time — the grouping key. */
  date: string;
  entries: ActivityEntry[];
}

interface Deletable {
  deletedAt?: string | null;
}

const live = <T extends Deletable>(rows: readonly T[] | undefined): T[] =>
  (rows ?? []).filter((row) => row.deletedAt == null);

/** Device-local calendar day. UTC slicing would file a 9pm log under tomorrow. */
export function localDay(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(
    at.getDate(),
  ).padStart(2, '0')}`;
}

function dayLabel(date: string, now: Date): string {
  const today = localDay(now.toISOString());
  if (date === today) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date === localDay(yesterday.toISOString())) return 'Yesterday';
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(y!, m! - 1, d!);
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(at);
  } catch {
    return date;
  }
}

export interface ActivityFeedInput {
  track: TrackResponse | null;
  home: HomeResponse | null;
  now?: Date;
  /** Cap on DAYS shown, not entries — a busy day is never truncated. */
  maxDays?: number;
}

export function buildActivityFeed({
  track,
  home,
  now = new Date(),
  maxDays = 3,
}: ActivityFeedInput): ActivityDay[] {
  if (!track) return [];
  const compounds = home?.activeCompounds ?? [];
  const compoundOf = (id: string) => compounds.find((compound) => compound.id === id);
  const entries: ActivityEntry[] = [];

  for (const dose of live(track.doseLogs)) {
    const compound = compoundOf(dose.compoundId);
    // Route-aware by way of the compound: an oral user's log never says "site",
    // and #7 already stopped writing injectionSite for them.
    const detail = dose.injectionSite
      ? siteLabel(dose.injectionSite)
      : compound
        ? `Logged ${doseNoun(compound.route)}`
        : '';
    entries.push({
      id: `dose-${dose.id}`,
      kind: 'dose',
      title: `${compound?.name ?? 'Medication'} · ${dose.amount} ${dose.unit}`,
      detail,
      datetime: dose.datetime,
    });
  }

  for (const weight of live(track.weightLogs)) {
    entries.push({
      id: `weight-${weight.id}`,
      kind: 'weight',
      title: `${weight.value} ${weight.unit}`,
      detail: '',
      datetime: weight.datetime,
    });
  }

  for (const protein of live(track.proteinLogs)) {
    entries.push({
      id: `protein-${protein.id}`,
      kind: 'protein',
      title: `${protein.grams} g protein`,
      detail: '',
      datetime: protein.datetime,
    });
  }

  for (const water of live(track.waterLogs)) {
    entries.push({
      id: `water-${water.id}`,
      kind: 'water',
      title: `${water.amountOz} oz water`,
      detail: '',
      datetime: water.datetime,
    });
  }

  for (const meal of live(track.mealLogs)) {
    entries.push({
      id: `meal-${meal.id}`,
      kind: 'meal',
      title: meal.foodName,
      detail: `${meal.calories} cal · ${meal.protein} g protein`,
      datetime: meal.datetime,
    });
  }

  for (const effect of live(track.sideEffectLogs)) {
    const names = (effect.types ?? []).map(sideEffectTypeLabel).join(', ');
    entries.push({
      id: `se-${effect.id}`,
      kind: 'sideEffect',
      title: names || 'Side effect',
      detail: effect.severity ? `Severity ${effect.severity} of 5` : '',
      datetime: effect.datetime,
    });
  }

  for (const activity of live(track.activityLogs)) {
    const bits = [
      activity.steps ? `${activity.steps} steps` : '',
      activity.workoutMinutes ? `${activity.workoutMinutes} min workout` : '',
    ].filter(Boolean);
    if (bits.length === 0) continue;
    entries.push({
      id: `act-${activity.id}`,
      kind: 'activity',
      title: bits[0]!,
      detail: bits[1] ?? '',
      datetime: activity.datetime,
    });
  }

  for (const measurement of live(track.measurements)) {
    entries.push({
      id: `meas-${measurement.id}`,
      kind: 'measurement',
      title: `${measurementLabel(measurement.type)} ${measurement.value} ${measurement.unit}`,
      detail: '',
      datetime: measurement.datetime,
    });
  }

  const byDay = new Map<string, ActivityEntry[]>();
  for (const entry of entries) {
    const day = localDay(entry.datetime);
    if (!day) continue;
    const bucket = byDay.get(day);
    if (bucket) bucket.push(entry);
    else byDay.set(day, [entry]);
  }

  return [...byDay.entries()]
    .sort(([left], [right]) => (left < right ? 1 : -1))
    .slice(0, maxDays)
    .map(([date, dayEntries]) => ({
      date,
      label: dayLabel(date, now),
      entries: dayEntries.sort(
        (left, right) => new Date(right.datetime).getTime() - new Date(left.datetime).getTime(),
      ),
    }));
}

/** "9:04 AM" · the right-hand column of each row. */
export function entryTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(at);
  } catch {
    return at.toISOString().slice(11, 16);
  }
}
