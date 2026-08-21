// WHEN the "Log a shot" button appears on Home's Medication Level card.
//
// The button used to be unconditional: it sat on the card forever, on every
// day, whether or not the user was due. That is the wrong shape for a card
// whose job is to report a level — a permanent call to action reads as an
// unfinished task and trains people to ignore it.
//
// THE RULE: the button is on the card exactly when a dose is actually wanted.
//   1. No dose ever logged  → show, beating. The card says the level needs a
//      dose; this is the way to give it one.
//   2. A dose is planned for today and none is logged yet → show, still.
//   3. A planned day inside the last two days was missed → show, still.
//   4. Anything else → gone, and the card collapses to level + bars.
//
// CADENCE COMES FROM THE USER'S OWN SCHEDULE — the frequency they picked in
// onboarding (daily / weekly on chosen days / biweekly / every N days), read
// through plannedDays, the SAME function that paints the purple due dot on
// Track's week strip. There is no second notion of "dose day" in the app, so
// the Home button and the Track calendar can never contradict each other. Rest
// weeks are honoured for free: cycleWindows says a rest day is not a dose day,
// and it is the one source of truth the backend's reminder pausing reads too.
//
// IT ONLY HIDES ON POSITIVE KNOWLEDGE. Not-due and don't-know are different
// answers, and only the first takes the button away:
//   · schedules still loading, or the request failed  → show
//   · the schedule carries no derivable cadence       → show
// Hiding on a failed fetch would silently remove the primary logging action
// from Home because a GET timed out.
//
// Pure and RN-free.

import type { CycleResponse, DoseLogResponse, ScheduleResponse } from '@pepta/shared';
import { isRestDay, localDateOnly, type CyclePattern } from '../../utils/cycleWindows';
import { activeCycleOf, loggedDays, patternOf, plannedDays } from './scheduleView';

/**
 * How far back a missed dose still counts as "due". Bounded on purpose: a
 * user who has genuinely stopped must not be given a permanent nag, and two
 * days covers the realistic "meant to do it, got busy" window for every
 * cadence this app supports.
 */
export const MISSED_LOOKBACK_DAYS = 2;

/**
 * Window used only to ask "can we derive this user's cadence at all?".
 * Wide enough that a monthly-ish custom interval still lands inside it, so an
 * empty result means no usable schedule rather than merely no dose soon.
 */
const CADENCE_PROBE_DAYS = 31;

export type DoseCtaReason =
  | 'first-dose'
  | 'due-today'
  | 'missed'
  | 'schedule-unknown'
  | 'not-due';

export interface DoseCtaState {
  show: boolean;
  /** The heartbeat. Only ever true for the very first dose. */
  pulse: boolean;
  reason: DoseCtaReason;
}

export interface DoseCtaInput {
  schedules: ScheduleResponse[] | null;
  cycles: CycleResponse[] | null;
  doseLogs: DoseLogResponse[] | null;
  today: Date;
}

function addDays(dateOnly: string, days: number): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

function dueOn(
  date: string,
  planned: Set<string>,
  logged: Set<string>,
  pattern: CyclePattern | null,
): boolean {
  if (!planned.has(date)) return false;
  if (logged.has(date)) return false;
  if (pattern && isRestDay(pattern, date)) return false;
  return true;
}

export function doseCtaState({
  schedules,
  cycles,
  doseLogs,
  today,
}: DoseCtaInput): DoseCtaState {
  // deletedAt is the only delete this app performs. Counting a deleted dose
  // would leave someone who logged one shot and removed it stuck with a card
  // that neither beats nor offers the button.
  // NULL IS "NOT LOADED", NOT "NONE". Track hydrates after the first paint, so
  // treating null as an empty list made every returning user's button beat on
  // each cold launch until it arrived — and the frame is explicit that the
  // heartbeat teaches the FIRST dose and "a returning user's Home never
  // twitches". Same guard the schedules === null case already has, a few lines
  // down; this was its missing twin.
  if (doseLogs === null) {
    return { show: true, pulse: false, reason: 'schedule-unknown' };
  }

  const live = doseLogs.filter((dose) => dose.deletedAt == null);

  if (live.length === 0) {
    return { show: true, pulse: true, reason: 'first-dose' };
  }

  // Still loading, or the schedules request failed: we do not know, so the
  // button stays exactly as it behaved before this rule existed.
  if (schedules === null) {
    return { show: true, pulse: false, reason: 'schedule-unknown' };
  }

  const todayOnly = localDateOnly(today);
  const probe = plannedDays(
    schedules,
    addDays(todayOnly, -CADENCE_PROBE_DAYS),
    addDays(todayOnly, CADENCE_PROBE_DAYS),
  );
  if (probe.size === 0) {
    // No active schedule, or one with no derivable cadence (a weekly schedule
    // with neither daysOfWeek nor an anchor). There is no such thing as a due
    // day for this user, so never take their logging action away.
    return { show: true, pulse: false, reason: 'schedule-unknown' };
  }

  const pattern = patternOf(activeCycleOf(cycles));
  const logged = loggedDays(live);

  // A DOSE LOGGED TODAY ENDS THE QUESTION. Not just "today isn't due" — this
  // also outranks a missed day, because a missed dose is history and taking a
  // second one today is not how you make up for it. The button must never be
  // on the card of someone who has already dosed today.
  if (logged.has(todayOnly)) {
    return { show: false, pulse: false, reason: 'not-due' };
  }

  if (dueOn(todayOnly, probe, logged, pattern)) {
    return { show: true, pulse: false, reason: 'due-today' };
  }
  for (let back = 1; back <= MISSED_LOOKBACK_DAYS; back += 1) {
    if (dueOn(addDays(todayOnly, -back), probe, logged, pattern)) {
      return { show: true, pulse: false, reason: 'missed' };
    }
  }

  return { show: false, pulse: false, reason: 'not-due' };
}
