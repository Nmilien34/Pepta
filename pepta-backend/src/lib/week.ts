import { addUtcDays, startOfUtcWeek, toDateOnly, wholeUtcDaysBetween } from './dates';

export interface UtcWeekRange {
  weekOf: string;
  start: Date;
  end: Date;
}

export function utcWeekRange(date = new Date()): UtcWeekRange {
  const start = startOfUtcWeek(date);
  const end = addUtcDays(start, 7);

  return {
    weekOf: toDateOnly(start),
    start,
    end,
  };
}

export function daysSinceDose(doseDatetime: string, now = new Date()): number {
  return Math.max(0, wholeUtcDaysBetween(now, new Date(doseDatetime)));
}

export function cycleDayFromShotDay(doseDatetime: string, now = new Date()): number {
  return daysSinceDose(doseDatetime, now) + 1;
}
