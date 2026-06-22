// Pure date-parts helpers for the wheel pickers (last shot, start date, birthday).
// Month index is 0-based to match JS Date. No RN imports → unit-testable. `now`
// is always injected so nothing depends on the system clock at module load.

export const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export interface DateParts {
  year: number;
  month: number; // 0-11
  day: number;
}

export function toDateParts(now: Date): DateParts {
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// Clamp the day to the selected month's length (e.g. Feb 31 -> Feb 28/29).
export function clampDay(parts: DateParts): DateParts {
  return { ...parts, day: Math.min(parts.day, daysInMonth(parts.year, parts.month)) };
}

// A past date (last shot / start date) cannot be in the future; pull it back.
export function clampToToday(parts: DateParts, now: Date): DateParts {
  const clamped = clampDay(parts);
  const selected = new Date(clamped.year, clamped.month, clamped.day).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return selected > today ? toDateParts(now) : clamped;
}

export function toIsoDate(parts: DateParts): string {
  const c = clampDay(parts);
  const m = String(c.month + 1).padStart(2, '0');
  const d = String(c.day).padStart(2, '0');
  return `${c.year}-${m}-${d}`;
}

export function formatLongDate(parts: DateParts): string {
  const c = clampDay(parts);
  return `${MONTHS_SHORT[c.month]} ${c.day}, ${c.year}`;
}

export function formatShortDate(parts: DateParts): string {
  const c = clampDay(parts);
  return `${MONTHS_SHORT[c.month]} ${c.day}`;
}

// Inclusive ascending integer range.
export function numberRange(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

// Recent years ending at the current year (for last-shot / start-date pickers).
export function recentYears(now: Date, yearsBack = 5): number[] {
  const current = now.getFullYear();
  return numberRange(current - yearsBack, current);
}
