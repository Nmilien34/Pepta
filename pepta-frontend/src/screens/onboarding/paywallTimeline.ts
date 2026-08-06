// Trial terms as pure data (design-lab/paywall-v2.html). The v1 timeline rows
// remain the canonical derivation; v2 renders them compressed as a looping
// one-slot carousel (trialTermSlides) instead of a hero timeline card.
// DATA-DRIVEN BY CONTRACT: day numbers and the charge date derive from the
// loaded intro offer and the clock — the Apple-side offer has an expiry and
// the trial length may change, so nothing here may ever be a baked-in "3".
// The reminder promise ("we remind you") is kept by trialReminder.service;
// unwire that and the reminder slide/row must come out too.

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

export interface TrialTermSlide {
  key: 'today' | 'reminder' | 'charge';
  /** Icon component name (same vocabulary the v1 timeline used). */
  icon: string;
  label: string;
}

/**
 * The v2 terms carousel: the timeline compressed to one-line slides for the
 * looping pill above the CTA. Same derivation and same one-day-trial rule as
 * buildTrialTimeline (no room for a reminder → no reminder slide). The
 * carousel is a reassurance layer, never the compliance surface — the 3.1.2
 * disclosure lives in the always-visible CTA subline + legal footer.
 */
export function trialTermSlides(trial: TrialLike, now: Date): TrialTermSlide[] {
  const days = trialTotalDays(trial);
  const chargeDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const slides: TrialTermSlide[] = [
    { key: 'today', icon: 'lock-open-outline', label: 'Free today — full access' },
  ];
  const reminderDay = days - 1;
  if (reminderDay >= 1) {
    slides.push({
      key: 'reminder',
      icon: 'notifications-outline',
      label: `Day ${reminderDay} — we remind you`,
    });
  }
  slides.push({
    key: 'charge',
    icon: 'calendar-outline',
    label: `Day ${days} — first charge, ${formatShortDate(toDateParts(chargeDate))}`,
  });
  return slides;
}
