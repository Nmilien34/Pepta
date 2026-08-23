// Pure derivations for the scheduling UI (Track week strip, cycle pill, month
// sheet). No fetching, no dates-from-now defaults — callers pass `today` so
// tests are deterministic and midnight rollovers can't split the UI.
//
// Dot semantics (design-lab Track frame): green = a shot was actually logged
// that day, purple = planned and still ahead (today or later), none = rest or
// nothing planned. Rest always beats planned — cycleWindows is the single
// source of truth for rest, so a paused reminder and a blank dot always agree.

import type {
  CycleResponse,
  DoseLogResponse,
  ScheduleResponse,
} from '@pepta/shared';
import {
  cycleDayStatus,
  hasPattern,
  isRestDay,
  localDateOnly,
  type CycleDayStatus,
  type CyclePattern,
} from '../../utils/cycleWindows';

/**
 * 'missed' is new with the mark-based strip: a day the schedule planned, now
 * in the past, with nothing logged against it. It used to collapse into
 * 'none', which drew it exactly like a rest day — the one distinction someone
 * checking whether they kept to their protocol actually needs.
 */
export type DayMark = 'logged' | 'due' | 'missed' | 'none';

export interface StripDay {
  date: string; // YYYY-MM-DD
  /**
   * "MON". The tiles name the day rather than numbering it — the mark carries
   * the state, so a number would be a second thing to read that says less.
   * (`letter` and `dayOfMonth` lived here for the old number-based strip; the
   * month sheet builds its own header and cells, and read neither.)
   */
  name: string;
  mark: DayMark;
  isToday: boolean;
}

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function addDays(dateOnly: string, days: number): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + days));
  return date.toISOString().slice(0, 10);
}

function dayOfWeek(dateOnly: string): number {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay(); // 0 = Sunday
}

function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round(
    (Date.UTC(by!, bm! - 1, bd!) - Date.UTC(ay!, am! - 1, ad!)) / 86_400_000,
  );
}

/** The cycle the UI talks about: newest active one, pattern-bearing preferred. */
export function activeCycleOf(
  cycles: CycleResponse[] | null,
): CycleResponse | null {
  if (!cycles) return null;
  const active = cycles.filter((c) => c.active);
  return active.find((c) => hasPattern(c)) ?? active[0] ?? null;
}

/** CyclePattern for cycleWindows, or null when the cycle has no on/off pattern. */
export function patternOf(cycle: CycleResponse | null): CyclePattern | null {
  if (!cycle || !hasPattern(cycle)) return null;
  return {
    startDate: cycle.startDate,
    weeksOn: cycle.weeksOn,
    weeksOff: cycle.weeksOff,
    repeats: cycle.repeats ?? true,
  };
}

/** Days with at least one logged shot, as local date-onlys. */
/**
 * Days a dose was actually taken.
 *
 * FILTERS deletedAt HERE, not at the call sites. It was filtered at exactly
 * one of the three — doseCta, which says why: "deletedAt is the only delete
 * this app performs". The other two, the week strip and the month calendar,
 * kept drawing a check and a green dot on a day whose dose the user had
 * removed. Doing it inside means a fourth caller cannot get it wrong.
 */
/**
 * Newest non-deleted dose day per compound — the cadence anchor.
 *
 * The BACKEND projects the next dose from the latest logged dose, falling back
 * to the schedule's stored anchor only when nothing was ever logged
 * (projectNextDoseAt). plannedDays anchored on schedule.nextDoseAt alone —
 * written at creation, never advanced by logging — so the first time someone
 * logged a day late, their real cadence walked away from the stored anchor and
 * every stale anchor day thereafter read as a red "missed", forever, for a
 * perfectly adherent user. Same anchor rule as the backend, so the strip, the
 * month calendar and the countdown all agree by construction.
 */
export function latestDoseDayByCompound(doseLogs: DoseLogResponse[]): Map<string, string> {
  const latest = new Map<string, number>();
  for (const log of doseLogs) {
    if (log.deletedAt != null) continue;
    const at = new Date(log.datetime).getTime();
    if (Number.isNaN(at)) continue;
    const seen = latest.get(log.compoundId);
    if (seen == null || at > seen) latest.set(log.compoundId, at);
  }
  const days = new Map<string, string>();
  for (const [compoundId, at] of latest) days.set(compoundId, localDateOnly(new Date(at)));
  return days;
}

export function loggedDays(doseLogs: DoseLogResponse[]): Set<string> {
  const days = new Set<string>();
  for (const log of doseLogs) {
    if (log.deletedAt != null) continue;
    days.add(localDateOnly(new Date(log.datetime)));
  }
  return days;
}

/**
 * Days a dose is planned in [from, to] inclusive, derived from active
 * schedules: daily = every day; weekly = daysOfWeek (0 = Sunday, JS
 * convention), else weekly cadence from the nextDoseAt anchor; biweekly =
 * 14-day cadence; custom = intervalDays cadence. Cadences project forward AND
 * backward from the anchor so month navigation stays consistent.
 */
export function plannedDays(
  schedules: ScheduleResponse[] | null,
  from: string,
  to: string,
  /** From latestDoseDayByCompound — omitted, cadences use the stored anchor. */
  latestByCompound?: ReadonlyMap<string, string>,
): Set<string> {
  const days = new Set<string>();
  if (!schedules) return days;
  const span = dayDiff(from, to);
  if (span < 0) return days;

  for (const schedule of schedules) {
    if (!schedule.active) continue;

    if (schedule.frequency === 'daily') {
      for (let i = 0; i <= span; i += 1) days.add(addDays(from, i));
      continue;
    }

    // Backend pharmacokinetics honors daysOfWeek for weekly AND custom.
    if (
      (schedule.frequency === 'weekly' || schedule.frequency === 'custom') &&
      schedule.daysOfWeek.length > 0
    ) {
      const wanted = new Set(schedule.daysOfWeek);
      for (let i = 0; i <= span; i += 1) {
        const date = addDays(from, i);
        if (wanted.has(dayOfWeek(date))) days.add(date);
      }
      continue;
    }

    // Cadence-based: weekly (no explicit days), biweekly, custom.
    const interval =
      schedule.frequency === 'weekly'
        ? 7
        : schedule.frequency === 'biweekly'
          ? 14
          : schedule.intervalDays;
    // The user's real rhythm wins; the stored anchor is for a schedule no dose
    // has ever been logged against. daysOfWeek schedules never reach here —
    // named days are a promise, not a drift.
    const loggedAnchor = latestByCompound?.get(schedule.compoundId) ?? null;
    if (!interval || (!loggedAnchor && !schedule.nextDoseAt)) continue;
    const anchor = loggedAnchor ?? localDateOnly(new Date(schedule.nextDoseAt!));
    // First on-or-after `from` that is ≡ anchor (mod interval).
    const offset = dayDiff(anchor, from);
    const first = addDays(from, ((-offset % interval) + interval) % interval);
    for (let date = first; dayDiff(date, to) >= 0; date = addDays(date, interval)) {
      days.add(date);
    }
  }
  return days;
}

/** Mark for one day given everything known about it. */
export function markForDay(
  date: string,
  today: string,
  logged: Set<string>,
  planned: Set<string>,
  pattern: CyclePattern | null,
): DayMark {
  if (logged.has(date)) return 'logged';
  if (planned.has(date) && !(pattern && isRestDay(pattern, date))) {
    // Ahead of today it is still coming; behind it, the day passed without a
    // log. Today itself counts as due until it ends.
    return dayDiff(today, date) >= 0 ? 'due' : 'missed';
  }
  return 'none';
}

/** The Monday-start week containing `today`, marked for the Track strip. */
export function weekStrip(
  today: Date,
  schedules: ScheduleResponse[] | null,
  doseLogs: DoseLogResponse[],
  pattern: CyclePattern | null,
  /**
   * The authoritative next dose, straight from /home — the same value the
   * countdown above the strip counts down to.
   *
   * The ring is derived from the schedule, which anchors on the schedule's own
   * stored nextDoseAt; the countdown comes from the backend, which recomputes
   * after every logged dose and skips cycle rest days. Those two can drift,
   * and when they do the card reads "Sat, Jun 27" over a ring on Friday.
   * Adding the real day means the day the user is being counted down to
   * always carries a ring.
   */
  nextDoseAt?: string | null,
): StripDay[] {
  const todayOnly = localDateOnly(today);
  const dow = dayOfWeek(todayOnly);
  const monday = addDays(todayOnly, dow === 0 ? -6 : 1 - dow);
  const sunday = addDays(monday, 6);
  const logged = loggedDays(doseLogs);
  const planned = plannedDays(schedules, monday, sunday, latestDoseDayByCompound(doseLogs));
  if (nextDoseAt) {
    const nextDay = localDateOnly(new Date(nextDoseAt));
    if (nextDay >= monday && nextDay <= sunday) planned.add(nextDay);
  }

  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return {
      date,
      name: DAY_NAMES[dayOfWeek(date)]!,
      mark: markForDay(date, todayOnly, logged, planned, pattern),
      isToday: date === todayOnly,
    };
  });
}

/** Cycle pill label + tint for the Next-dose card; null hides the pill. */
export function cyclePillFor(
  pattern: CyclePattern | null,
  today: Date,
): { label: string; phase: 'on' | 'rest' } | null {
  if (!pattern) return null;
  const status = cycleDayStatus(pattern, localDateOnly(today));
  if (status.phase === 'on') {
    return { label: `Week ${status.weekInPhase}/${status.weeksInPhase}`, phase: 'on' };
  }
  if (status.phase === 'rest') {
    return { label: `Rest ${status.weekInPhase}/${status.weeksInPhase}`, phase: 'rest' };
  }
  return null;
}

/**
 * True when the upcoming dose is the last one before a rest window — the
 * design's "· last of this cycle" caption. Looks for the next planned day
 * strictly after the dose within a 62-day horizon; last-of-cycle means that
 * next planned day falls on rest (or the cycle is over and never repeats).
 */
export function isLastDoseOfCycle(
  nextDoseAt: string,
  schedules: ScheduleResponse[] | null,
  pattern: CyclePattern | null,
): boolean {
  if (!pattern) return false;
  const doseDay = localDateOnly(new Date(nextDoseAt));
  const doseStatus = cycleDayStatus(pattern, doseDay);
  if (doseStatus.phase !== 'on') return false;

  const planned = plannedDays(schedules, addDays(doseDay, 1), addDays(doseDay, 62));
  const next = [...planned].sort()[0];
  if (!next) return false;
  const nextStatus = cycleDayStatus(pattern, next);
  return nextStatus.phase === 'rest' || nextStatus.phase === 'done';
}

/** Status for "today", used by the sheet's day card + cycle row. */
export function todayCycleStatus(
  pattern: CyclePattern | null,
  today: Date,
): CycleDayStatus | null {
  return pattern ? cycleDayStatus(pattern, localDateOnly(today)) : null;
}

/** "Jul 13" from a date-only string (UTC-pinned so the label can't drift). */
export function shortDateOnly(dateOnly: string): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
