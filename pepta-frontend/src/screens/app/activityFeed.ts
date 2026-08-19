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

/**
 * The full-history window, shared by the See-all screen and by Track's test of
 * whether See all is worth offering. Two numbers here would mean the card
 * could hide a link to a screen that had more to show. /track looks back 30
 * days, so this is a ceiling the payload reaches first, not a cap of its own.
 */
export const FULL_FEED_DAYS = 400;

export interface ActivityFeedInput {
  track: TrackResponse | null;
  home: HomeResponse | null;
  now?: Date;
  /** Cap on DAYS shown, not entries — a busy day is never truncated. */
  maxDays?: number;
}

/** 1-5 as a word, the way the frame writes it: "Nausea · mild". */
export function severityWord(severity: number | null | undefined): string {
  if (severity == null) return '';
  if (severity <= 2) return 'mild';
  if (severity === 3) return 'moderate';
  return 'severe';
}

/**
 * "2 days after your dose" — the line that makes a side effect mean something.
 * Counted from the most recent dose AT OR BEFORE it, because a side effect is
 * read against the shot that preceded it, never the next one.
 */
function daysAfterDose(at: string, doseTimes: number[]): string {
  const when = new Date(at).getTime();
  if (!Number.isFinite(when)) return '';
  const previous = doseTimes.filter((time) => time <= when).sort((a, b) => b - a)[0];
  if (previous == null) return '';
  const days = Math.floor((when - previous) / 86_400_000);
  if (days === 0) return 'Same day as your dose';
  return `${days} day${days === 1 ? '' : 's'} after your dose`;
}

/**
 * "Down 1.2 lb this week".
 *
 * Only against a log 5-10 days older, so "this week" is a claim the data
 * actually supports. Someone who weighs in twice in one morning gets no line
 * rather than a fabricated weekly trend.
 */
function weightTrend(
  value: number,
  unit: string,
  at: string,
  history: { value: number; datetime: string }[],
): string {
  const when = new Date(at).getTime();
  const prior = history
    .map((row) => ({ value: row.value, time: new Date(row.datetime).getTime() }))
    .filter((row) => {
      const days = (when - row.time) / 86_400_000;
      return days >= 5 && days <= 10;
    })
    .sort((a, b) => b.time - a.time)[0];
  if (!prior) return '';
  const delta = Math.round((value - prior.value) * 10) / 10;
  if (delta === 0) return 'Same as last week';
  return `${delta < 0 ? 'Down' : 'Up'} ${Math.abs(delta)} ${unit} this week`;
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
  const today = localDay(now.toISOString());
  const doseTimes = live(track.doseLogs)
    .map((dose) => new Date(dose.datetime).getTime())
    .filter((time) => Number.isFinite(time));
  const weightHistory = live(track.weightLogs);
  /**
   * A target only describes the day it is set for. Printing today's 140 g
   * under a row from three weeks ago would state a target that may never have
   * been theirs — so the reference line is offered on today's rows only.
   */
  const targetFor = (unitTarget: number | undefined, at: string, suffix: string) =>
    unitTarget && localDay(at) === today ? `Of ${unitTarget} ${suffix} today` : '';

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

  for (const weight of weightHistory) {
    entries.push({
      id: `weight-${weight.id}`,
      kind: 'weight',
      title: `${weight.value} ${weight.unit}`,
      detail: weightTrend(weight.value, weight.unit, weight.datetime, weightHistory),
      datetime: weight.datetime,
    });
  }

  for (const protein of live(track.proteinLogs)) {
    entries.push({
      id: `protein-${protein.id}`,
      kind: 'protein',
      title: `${protein.grams} g protein`,
      detail: targetFor(home?.profile?.dailyProteinTargetGrams, protein.datetime, 'g'),
      datetime: protein.datetime,
    });
  }

  for (const water of live(track.waterLogs)) {
    entries.push({
      id: `water-${water.id}`,
      kind: 'water',
      title: `${water.amountOz} oz water`,
      detail: targetFor(home?.profile?.dailyWaterTargetOz, water.datetime, 'oz'),
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
    const word = severityWord(effect.severity);
    entries.push({
      id: `se-${effect.id}`,
      kind: 'sideEffect',
      // Severity joins the title as a word — "Nausea · mild" — because
      // "Severity 3 of 5" made the reader do the conversion, and the detail
      // line is worth more spent on when it happened relative to the dose.
      title: [names || 'Side effect', word].filter(Boolean).join(' · '),
      detail: daysAfterDose(effect.datetime, doseTimes),
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

  const ordered = [...byDay.entries()].sort(([left], [right]) => (left < right ? 1 : -1));
  const selected = ordered.slice(0, maxDays);

  // THE DOSE IS THIS APP'S ANCHOR, so it is never allowed to fall off the end.
  // A weekly injector who logs water daily fills the three most recent days
  // with habit logs and pushes their last shot out of the window entirely —
  // three rows of water and no dose, where the doses-only card this replaced
  // would have shown their last eight. When the window contains no dose, the
  // most recent dose day is appended (it is older, so it stays last).
  const hasDose = (day: [string, ActivityEntry[]]) =>
    day[1].some((entry) => entry.kind === 'dose');
  if (!selected.some(hasDose)) {
    const mostRecentDoseDay = ordered.find(hasDose);
    if (mostRecentDoseDay) selected.push(mostRecentDoseDay);
  }

  return selected
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
