// Pure helpers for the protocol dose-timing editor. Times are user-local
// wall-clock "HH:MM" strings (the shared schema's timeOfDay contract) — the
// backend converts through the profile timezone when projecting nextDoseAt.

import type { ScheduleResponse } from '@pepta/shared';

export type ScheduleTiming = NonNullable<ScheduleResponse['timing']>;

export const TIMING_OPTIONS: ReadonlyArray<{ label: string; value: ScheduleTiming }> = [
  { label: 'Anytime', value: 'anytime' },
  { label: 'Fasted', value: 'fasted' },
  { label: 'Before bed', value: 'before_bed' },
  { label: 'With food', value: 'with_food' },
];

export function timingLabel(timing: ScheduleTiming | undefined): string | null {
  if (!timing || timing === 'anytime') return null;
  return TIMING_OPTIONS.find((option) => option.value === timing)?.label ?? null;
}

/** "21:30" → "9:30 PM". */
export function formatTimeOfDay(hhmm: string): string {
  const [hh, mm] = hhmm.split(':').map(Number);
  const hour12 = hh! % 12 === 0 ? 12 : hh! % 12;
  const minutes = String(mm).padStart(2, '0');
  return `${hour12}:${minutes} ${hh! < 12 ? 'AM' : 'PM'}`;
}

/** "8:00 AM & 8:00 PM" for row values and the day card. */
export function formatTimesOfDay(times: string[]): string {
  return [...times].sort().map(formatTimeOfDay).join(' & ');
}

/** Step a wall time by whole minutes, wrapping around midnight. */
export function stepTime(hhmm: string, deltaMinutes: number): string {
  const [hh, mm] = hhmm.split(':').map(Number);
  const total = (((hh! * 60 + mm! + deltaMinutes) % 1440) + 1440) % 1440;
  const nextH = String(Math.floor(total / 60)).padStart(2, '0');
  const nextM = String(total % 60).padStart(2, '0');
  return `${nextH}:${nextM}`;
}

/**
 * Editor seed: the schedule's saved times, else the wall time of its
 * nextDoseAt (how timing has been implicitly stored until now), else 8 AM.
 */
export function defaultTimesFor(schedule: ScheduleResponse | null): string[] {
  if (schedule?.timesOfDay && schedule.timesOfDay.length > 0) {
    return [...schedule.timesOfDay].sort();
  }
  if (schedule?.nextDoseAt) {
    const at = new Date(schedule.nextDoseAt);
    if (!Number.isNaN(at.getTime())) {
      const hh = String(at.getHours()).padStart(2, '0');
      const mm = String(at.getMinutes()).padStart(2, '0');
      return [`${hh}:${mm}`];
    }
  }
  return ['08:00'];
}

/** The schedule the timing editor operates on: the primary active one. */
export function primarySchedule(
  schedules: ScheduleResponse[] | null,
): ScheduleResponse | null {
  return schedules?.find((schedule) => schedule.active) ?? null;
}
