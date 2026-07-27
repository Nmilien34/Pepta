// Cycle on/off windows — THE single source of truth for "is this a rest
// day", shared by the app (week strip, month-sheet band, Track rest card)
// and the backend (nextDoseAt skips rest days, so reminders pause). Both
// sides reading one implementation is what makes a paused reminder and a
// green calendar band impossible to disagree.
//
// All math is date-only (YYYY-MM-DD), computed in UTC day-space so DST
// transitions can't shift a window by an hour and split a band.

export interface CyclePattern {
  /** First day of week 1 (YYYY-MM-DD). */
  startDate: string;
  weeksOn: number;
  weeksOff: number;
  /** false = one cycle only: after the single rest window the cycle is done. */
  repeats: boolean;
}

export type CyclePhase = 'on' | 'rest' | 'done' | 'upcoming';

export interface CycleDayStatus {
  phase: CyclePhase;
  /** 1-based week number within the current phase (on or rest). */
  weekInPhase: number;
  /** Total weeks in the current phase. */
  weeksInPhase: number;
  /** Date-only bounds of the current phase. */
  phaseStart: string;
  phaseEnd: string;
  /** For 'on': first rest day after this phase. For 'rest': first on day (or null when done). */
  nextPhaseStart: string | null;
}

export interface RestWindow {
  start: string;
  end: string;
}

function toUtcDay(dateOnly: string): number {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!) / 86_400_000;
}

function fromUtcDay(day: number): string {
  const date = new Date(day * 86_400_000);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function hasPattern(cycle: {
  weeksOn?: number | null;
  weeksOff?: number | null;
  startDate?: string;
}): cycle is { weeksOn: number; weeksOff: number; startDate: string } {
  return (
    typeof cycle.weeksOn === 'number' &&
    cycle.weeksOn >= 1 &&
    typeof cycle.weeksOff === 'number' &&
    cycle.weeksOff >= 1 &&
    typeof cycle.startDate === 'string'
  );
}

/** Phase + position for a given date-only day. */
export function cycleDayStatus(pattern: CyclePattern, dateOnly: string): CycleDayStatus {
  const start = toUtcDay(pattern.startDate);
  const day = toUtcDay(dateOnly);
  const onDays = pattern.weeksOn * 7;
  const offDays = pattern.weeksOff * 7;
  const period = onDays + offDays;
  const sinceStart = day - start;

  if (sinceStart < 0) {
    return {
      phase: 'upcoming',
      weekInPhase: 0,
      weeksInPhase: pattern.weeksOn,
      phaseStart: pattern.startDate,
      phaseEnd: fromUtcDay(start + onDays - 1),
      nextPhaseStart: pattern.startDate,
    };
  }

  if (!pattern.repeats && sinceStart >= period) {
    return {
      phase: 'done',
      weekInPhase: 0,
      weeksInPhase: 0,
      phaseStart: fromUtcDay(start + period),
      phaseEnd: fromUtcDay(start + period),
      nextPhaseStart: null,
    };
  }

  const inPeriod = sinceStart % period;
  const periodStart = day - inPeriod;

  if (inPeriod < onDays) {
    return {
      phase: 'on',
      weekInPhase: Math.floor(inPeriod / 7) + 1,
      weeksInPhase: pattern.weeksOn,
      phaseStart: fromUtcDay(periodStart),
      phaseEnd: fromUtcDay(periodStart + onDays - 1),
      nextPhaseStart: fromUtcDay(periodStart + onDays),
    };
  }

  const restStart = periodStart + onDays;
  return {
    phase: 'rest',
    weekInPhase: Math.floor((inPeriod - onDays) / 7) + 1,
    weeksInPhase: pattern.weeksOff,
    phaseStart: fromUtcDay(restStart),
    phaseEnd: fromUtcDay(restStart + offDays - 1),
    nextPhaseStart:
      pattern.repeats ? fromUtcDay(periodStart + period) : null,
  };
}

export function isRestDay(pattern: CyclePattern, dateOnly: string): boolean {
  return cycleDayStatus(pattern, dateOnly).phase === 'rest';
}

/** Every rest window intersecting [from, to] inclusive (date-only). */
export function restWindows(
  pattern: CyclePattern,
  from: string,
  to: string,
): RestWindow[] {
  const start = toUtcDay(pattern.startDate);
  const fromDay = toUtcDay(from);
  const toDay = toUtcDay(to);
  const onDays = pattern.weeksOn * 7;
  const offDays = pattern.weeksOff * 7;
  const period = onDays + offDays;

  const windows: RestWindow[] = [];
  // First period that could intersect the range.
  let k = Math.floor((fromDay - start - (onDays + offDays - 1)) / period);
  if (k < 0) k = 0;
  for (; ; k += 1) {
    if (!pattern.repeats && k > 0) break;
    const restStart = start + k * period + onDays;
    const restEnd = restStart + offDays - 1;
    if (restStart > toDay) break;
    if (restEnd >= fromDay) {
      // Full window, unclamped — callers clamp to their own grid if needed.
      windows.push({ start: fromUtcDay(restStart), end: fromUtcDay(restEnd) });
    }
  }
  return windows;
}
