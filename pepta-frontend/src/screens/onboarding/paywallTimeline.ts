// The trial timeline (design-lab/trial-warmup.html, screen C) as pure data.
// DATA-DRIVEN BY CONTRACT: day numbers and the charge date derive from the
// loaded intro offer and the clock — the Apple-side offer has an expiry and
// the trial length may change, so nothing here may ever be a baked-in "3".
// The reminder row's promise is kept by trialReminder.service; unwire that
// and the reminder row must come out too.

import { formatShortDate, toDateParts } from '../../utils/dateParts';

export interface TrialLike {
  periodNumberOfUnits: number;
  periodUnit: string;
}

export interface TrialTimelineRow {
  key: 'today' | 'reminder' | 'charge';
  title: string;
  sub: string;
  /** The right-column tag: "Today" / "Day 2" / "Day 3". */
  day: string;
}

const UNIT_DAYS: Record<string, number> = { day: 1, week: 7, month: 30 };

/** Total trial length in days ("3 DAY" → 3, "1 WEEK" → 7). */
export function trialTotalDays(trial: TrialLike): number {
  const perUnit = UNIT_DAYS[trial.periodUnit.toLowerCase()] ?? 1;
  return Math.max(1, trial.periodNumberOfUnits * perUnit);
}

/**
 * Radical transparency about the charge: naming the charge date and promising
 * a reminder is what removes the "silently billed" fear that is the dominant
 * objection to free trials. Reminder lands the day BEFORE the charge; a
 * one-day trial has no room for it, so the row is omitted rather than lying.
 */
export function buildTrialTimeline(trial: TrialLike, now: Date): TrialTimelineRow[] {
  const days = trialTotalDays(trial);
  const chargeDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const rows: TrialTimelineRow[] = [
    {
      key: 'today',
      title: 'Instant access',
      sub: 'Your plan, levels and tracking — all of it, right now.',
      day: 'Today',
    },
  ];
  const reminderDay = days - 1;
  if (reminderDay >= 1) {
    rows.push({
      key: 'reminder',
      title: 'We remind you',
      sub: 'A notification that your trial is ending. No surprises.',
      day: `Day ${reminderDay}`,
    });
  }
  rows.push({
    key: 'charge',
    title: `First charge — ${formatShortDate(toDateParts(chargeDate))}`,
    sub: 'Cancel anytime before, in one tap.',
    day: `Day ${days}`,
  });
  return rows;
}

/** "Your 3 free days start now" — grammatical for any unit count. */
export function freeStartHeadline(trial: TrialLike): string {
  const unit = trial.periodUnit.toLowerCase();
  const n = trial.periodNumberOfUnits;
  if (n === 1) return `Your free ${unit} starts now`;
  return `Your ${n} free ${unit}s start now`;
}
