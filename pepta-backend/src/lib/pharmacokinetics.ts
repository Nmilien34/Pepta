import { cycleDayStatus, type CyclePattern } from "@pepta/shared";
import {
  addDaysDateOnly,
  dateOnlyInTz,
  dayDiff,
  dayOfWeekOf,
  isValidTimeZone,
  zonedTimeToUtc,
} from "./timezone";

export const PHARMACOKINETICS_ENGINE_VERSION = "pk-v2";

const MS_PER_HOUR = 60 * 60 * 1000;
const HOURS_PER_DAY = 24;
const CURVE_SAMPLE_HOURS = 6;
// Widest search for the next on-cycle dose day: past the longest allowed rest
// window (52 weeks) plus a schedule period.
const MAX_NEXT_DOSE_LOOKAHEAD_DAYS = 400;
/**
 * A daily schedule with no stored time still needs an hour to project to.
 * 9:00 AM LOCAL, computed here and never written to the schedule — nothing
 * is backfilled, and the first time a user edits their dose time an explicit
 * value replaces this. Daily only: weekly/biweekly projections keep deriving
 * their time-of-day from the last logged dose, exactly as before.
 */
const DEFAULT_DAILY_TIME_OF_DAY = "09:00";

export interface MedicationSchedule {
  frequency: "daily" | "weekly" | "biweekly" | "custom";
  intervalDays?: number;
  daysOfWeek?: number[];
  /** User-local "HH:MM" dose times (protocol timing; up to 3 = split dosing). */
  timesOfDay?: string[];
}

export interface MedicationDose {
  amount: number;
  datetime: string;
}

export interface MedicationLevelInput {
  compoundId: string;
  compoundName: string;
  halfLifeDays: number;
  doses: MedicationDose[];
  now?: Date;
  scheduleIntervalDays?: number;
  schedule?: MedicationSchedule;
  /** On/off cycle: next-dose projection skips rest days so reminders pause. */
  cyclePattern?: CyclePattern;
  /** Fallback anchor when nothing has been logged — see projectNextDoseAt. */
  scheduleAnchor?: Date;
  /** IANA zone the schedule's timesOfDay are expressed in (profile timezone). */
  timeZone?: string;
  curveDaysBefore?: number;
  curveDaysAfter?: number;
}

export interface MedicationLevelPoint {
  datetime: string;
  level: number;
}

export interface MedicationLevelResult {
  compoundId: string;
  compoundName: string;
  halfLifeDays: number;
  currentEstimate: number;
  peakEstimate: number;
  troughEstimate: number;
  curve: MedicationLevelPoint[];
  nextDoseAt: string | null;
  hoursUntilNextDose: number | null;
  /** Relative dose-equivalent estimate, not a measured serum concentration. */
  estimateBasis: "relative-dose-equivalent";
  engineVersion: typeof PHARMACOKINETICS_ENGINE_VERSION;
}

function elapsedDays(later: Date, earlier: Date): number {
  return (later.getTime() - earlier.getTime()) / (MS_PER_HOUR * HOURS_PER_DAY);
}

function roundLevel(value: number): number {
  return Number(value.toFixed(4));
}

function levelAt(
  doses: MedicationDose[],
  halfLifeDays: number,
  at: Date,
): number {
  const level = doses.reduce((sum, dose) => {
    const doseAt = new Date(dose.datetime);

    if (Number.isNaN(doseAt.getTime()) || doseAt.getTime() > at.getTime()) {
      return sum;
    }

    const days = elapsedDays(at, doseAt);
    return sum + dose.amount * 0.5 ** (days / halfLifeDays);
  }, 0);

  return roundLevel(level);
}

export function latestDose(doses: MedicationDose[]): MedicationDose | null {
  const sorted = doses
    .filter((dose) => !Number.isNaN(new Date(dose.datetime).getTime()))
    .sort(
      (left, right) =>
        new Date(right.datetime).getTime() - new Date(left.datetime).getTime(),
    );

  return sorted[0] ?? null;
}

function msForDays(days: number): number {
  return days * HOURS_PER_DAY * MS_PER_HOUR;
}

function buildCurve(
  input: Required<
    Pick<MedicationLevelInput, "curveDaysAfter" | "curveDaysBefore">
  > & {
    doses: MedicationDose[];
    halfLifeDays: number;
    now: Date;
  },
): MedicationLevelPoint[] {
  const points: MedicationLevelPoint[] = [];
  const start = new Date(input.now);
  start.setUTCDate(start.getUTCDate() - input.curveDaysBefore);
  start.setUTCHours(0, 0, 0, 0);

  const totalDays = input.curveDaysBefore + input.curveDaysAfter;
  const totalSteps = Math.floor(
    (totalDays * HOURS_PER_DAY) / CURVE_SAMPLE_HOURS,
  );
  for (let index = 0; index <= totalSteps; index += 1) {
    const at = new Date(
      start.getTime() + index * CURVE_SAMPLE_HOURS * MS_PER_HOUR,
    );
    points.push({
      datetime: at.toISOString(),
      level: levelAt(input.doses, input.halfLifeDays, at),
    });
  }

  return points;
}

// Rest-day check in UTC day-space (matching the daysOfWeek getUTCDay logic).
// 'rest' days are skipped; a finished one-shot cycle ('done') means no next
// dose at all — that is what pauses reminders during an off-cycle window.
function cyclePhaseAt(pattern: CyclePattern | undefined, at: Date) {
  if (!pattern) return "on" as const;
  return cycleDayStatus(pattern, at.toISOString().slice(0, 10)).phase;
}

// Does the schedule call for a dose on this calendar day (user-local)?
// daysOfWeek wins when present; otherwise cadence anchored at the last dose.
function scheduleMatchesDay(
  schedule: MedicationSchedule,
  dateOnly: string,
  anchorDateOnly: string,
): boolean {
  if (schedule.frequency === "daily") return true;
  const days = schedule.daysOfWeek ?? [];
  if (days.length > 0) return days.includes(dayOfWeekOf(dateOnly));
  const interval =
    schedule.frequency === "weekly"
      ? 7
      : schedule.frequency === "biweekly"
        ? 14
        : schedule.intervalDays;
  if (!interval) return false;
  // >= 0: the last-dose day itself is a scheduled day — a later listed time
  // that same day (split dosing) must still project.
  const since = dayDiff(anchorDateOnly, dateOnly);
  return since >= 0 && since % interval === 0;
}

// Protocol-timing projection: the next dose is the earliest listed wall-clock
// time, on the next scheduled day, converted from the user's zone — instead
// of echoing whatever hour the last dose happened to be logged at. Split
// dosing falls out naturally: after the 08:00 shot is logged, the projection
// lands on 20:00 the same day. Cycle phases are judged on the USER-LOCAL day.
function nextDoseFromTimes(input: {
  latestAt: Date;
  now: Date;
  schedule: MedicationSchedule;
  timesOfDay: string[];
  timeZone: string;
  cyclePattern?: CyclePattern;
}): Date | null {
  const times = [...input.timesOfDay].sort();
  const anchor = dateOnlyInTz(input.latestAt, input.timeZone);
  const today = dateOnlyInTz(input.now, input.timeZone);

  for (let offset = 0; offset <= MAX_NEXT_DOSE_LOOKAHEAD_DAYS; offset += 1) {
    const day = addDaysDateOnly(today, offset);
    if (!scheduleMatchesDay(input.schedule, day, anchor)) continue;
    if (input.cyclePattern) {
      const phase = cycleDayStatus(input.cyclePattern, day).phase;
      if (phase === "done") return null;
      if (phase === "rest") continue;
    }
    for (const time of times) {
      const candidate = zonedTimeToUtc(day, time, input.timeZone);
      if (candidate.getTime() > input.now.getTime()) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * EXPORTED (2026-08-11) so scheduling can be computed WITHOUT the PK model.
 * Next-dose timing is a property of the schedule — frequency, dose times,
 * cycle pattern, last logged dose — and needs no half-life. It lived behind
 * computeMedicationLevel, which meant a compound with no half-life produced
 * no projection at all: no countdown and no dose reminder. Same function,
 * same inputs, now reachable on its own.
 */
export function projectNextDoseAt(input: {
  latest: MedicationDose | null;
  now: Date;
  schedule?: MedicationSchedule;
  fallbackIntervalDays?: number;
  cyclePattern?: CyclePattern;
  timeZone?: string;
  /**
   * FALLBACK ANCHOR (2026-08-11) — when the schedule was created.
   *
   * Used ONLY when no dose has ever been logged. Until now a perfect schedule
   * armed nothing: the projection anchored on the last dose and returned null
   * without one, so a new user got no countdown and no dose reminder until they
   * happened to log manually. A schedule is a statement of intent; it should
   * project from the moment it exists.
   *
   * Note there is no separate "seeded onboarding dose" anchor: when the user
   * answers the last-shot turn, onboarding writes a REAL dose log, so that case
   * is already the primary anchor and naturally wins over this one.
   */
  scheduleAnchor?: Date;
}): Date | null {
  // The dose anchor is preferred whenever one exists, so every user who has
  // logged a dose projects EXACTLY as before — this whole feature is invisible
  // to them by construction, not by careful arithmetic.
  const anchorIsSchedule = input.latest === null;
  const anchorAt = anchorIsSchedule
    ? (input.scheduleAnchor ?? null)
    : new Date(input.latest!.datetime);

  if (anchorAt === null || Number.isNaN(anchorAt.getTime())) {
    return null;
  }

  const latestAt = anchorAt;

  // A daily schedule without an explicit time falls back to the 9:00 AM
  // default so it projects a real next dose instead of dragging whatever
  // hour the last dose happened to be logged at (onboarding seeds noon).
  const storedTimes = input.schedule?.timesOfDay ?? [];
  // The 9:00 default also covers EVERY schedule-anchored projection, not just
  // daily. Without it a weekly schedule with no stored time inherits the hour
  // it was created at — one real user's schedule was created at 11:26 PM, so
  // their first-ever dose reminder would have fired at 11:26 PM. A dose-anchored
  // projection still derives its hour from the actual dose, unchanged.
  const times =
    storedTimes.length === 0 &&
    (input.schedule?.frequency === "daily" || anchorIsSchedule)
      ? [DEFAULT_DAILY_TIME_OF_DAY]
      : storedTimes;
  if (
    input.schedule &&
    times.length > 0 &&
    input.timeZone &&
    isValidTimeZone(input.timeZone)
  ) {
    return nextDoseFromTimes({
      latestAt,
      now: input.now,
      schedule: input.schedule,
      timesOfDay: times,
      timeZone: input.timeZone,
      cyclePattern: input.cyclePattern,
    });
  }

  const scheduleDays = input.schedule?.daysOfWeek ?? [];

  if (
    input.schedule &&
    (input.schedule.frequency === "weekly" ||
      input.schedule.frequency === "custom") &&
    scheduleDays.length > 0
  ) {
    const lookahead = input.cyclePattern ? MAX_NEXT_DOSE_LOOKAHEAD_DAYS : 31;
    for (let dayOffset = 0; dayOffset <= lookahead; dayOffset += 1) {
      const candidate = new Date(input.now);
      candidate.setUTCHours(0, 0, 0, 0);
      candidate.setUTCDate(candidate.getUTCDate() + dayOffset);
      candidate.setUTCHours(
        latestAt.getUTCHours(),
        latestAt.getUTCMinutes(),
        latestAt.getUTCSeconds(),
        latestAt.getUTCMilliseconds(),
      );

      if (
        candidate.getTime() > input.now.getTime() &&
        scheduleDays.includes(candidate.getUTCDay())
      ) {
        const phase = cyclePhaseAt(input.cyclePattern, candidate);
        if (phase === "rest") continue;
        if (phase === "done") return null;
        return candidate;
      }
    }
    if (input.cyclePattern) return null;
  }

  const intervalDays =
    input.schedule?.intervalDays ?? input.fallbackIntervalDays;
  if (!intervalDays) {
    return null;
  }

  let candidate = new Date(latestAt.getTime() + msForDays(intervalDays));

  // Schedule-anchored only: a schedule created weeks ago that never saw a dose
  // would otherwise project creation+interval, which is already in the past —
  // an immediately-overdue reminder the moment it arms. Roll forward to the
  // next real occurrence.
  //
  // Deliberately NOT applied to the dose-anchored path: a user who stopped
  // logging keeps their existing (possibly overdue) projection, because
  // changing it would move a value shipped clients already display.
  if (anchorIsSchedule) {
    while (candidate.getTime() <= input.now.getTime()) {
      candidate = new Date(candidate.getTime() + msForDays(intervalDays));
    }
  }

  for (
    let advanced = 0;
    advanced <= MAX_NEXT_DOSE_LOOKAHEAD_DAYS;
    advanced += 1
  ) {
    const phase = cyclePhaseAt(input.cyclePattern, candidate);
    if (phase === "done") return null;
    if (phase !== "rest") return candidate;
    candidate = new Date(candidate.getTime() + msForDays(1));
  }
  return null;
}

function forwardTrough(input: {
  doses: MedicationDose[];
  halfLifeDays: number;
  now: Date;
  nextDose: Date | null;
  curveDaysAfter: number;
}): number {
  const end =
    input.nextDose && input.nextDose.getTime() > input.now.getTime()
      ? input.nextDose
      : new Date(input.now.getTime() + msForDays(input.curveDaysAfter));
  const levels: number[] = [];

  for (
    let atMs = input.now.getTime();
    atMs <= end.getTime();
    atMs += CURVE_SAMPLE_HOURS * MS_PER_HOUR
  ) {
    levels.push(levelAt(input.doses, input.halfLifeDays, new Date(atMs)));
  }

  if (levels.length === 0) {
    return levelAt(input.doses, input.halfLifeDays, input.now);
  }

  return Math.min(...levels);
}

export function computeMedicationLevel(
  input: MedicationLevelInput,
): MedicationLevelResult {
  const now = input.now ?? new Date();
  const curveDaysBefore = input.curveDaysBefore ?? 7;
  const curveDaysAfter = input.curveDaysAfter ?? 7;
  const curve = buildCurve({
    doses: input.doses,
    halfLifeDays: input.halfLifeDays,
    now,
    curveDaysBefore,
    curveDaysAfter,
  });
  const latest = latestDose(input.doses);
  const nextDose = projectNextDoseAt({
    latest,
    now,
    schedule: input.schedule,
    fallbackIntervalDays: input.scheduleIntervalDays,
    scheduleAnchor: input.scheduleAnchor,
    cyclePattern: input.cyclePattern,
    timeZone: input.timeZone,
  });
  const hoursUntilNextDose =
    nextDose === null
      ? null
      : Math.max(
          0,
          Math.round((nextDose.getTime() - now.getTime()) / MS_PER_HOUR),
        );
  const levels = curve.map((point) => point.level);

  return {
    compoundId: input.compoundId,
    compoundName: input.compoundName,
    halfLifeDays: input.halfLifeDays,
    currentEstimate: levelAt(input.doses, input.halfLifeDays, now),
    peakEstimate: levels.length > 0 ? Math.max(...levels) : 0,
    troughEstimate: forwardTrough({
      doses: input.doses,
      halfLifeDays: input.halfLifeDays,
      now,
      nextDose,
      curveDaysAfter,
    }),
    curve,
    nextDoseAt: nextDose?.toISOString() ?? null,
    hoursUntilNextDose,
    estimateBasis: "relative-dose-equivalent",
    engineVersion: PHARMACOKINETICS_ENGINE_VERSION,
  };
}
