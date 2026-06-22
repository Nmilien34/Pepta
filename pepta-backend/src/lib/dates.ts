const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function startOfUtcWeek(date: Date): Date {
  const normalized = startOfUtcDay(date);
  const day = normalized.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  normalized.setUTCDate(normalized.getUTCDate() - daysSinceMonday);
  return normalized;
}

export function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function wholeUtcDaysBetween(later: Date, earlier: Date): number {
  return Math.floor((startOfUtcDay(later).getTime() - startOfUtcDay(earlier).getTime()) / MS_PER_DAY);
}

export function cycleDay(lastDoseDatetime: string, now: Date): number {
  const lastDose = new Date(lastDoseDatetime);
  const elapsedDays = Math.floor((now.getTime() - lastDose.getTime()) / MS_PER_DAY);
  return Math.max(1, elapsedDays + 1);
}
