// The trial window's touchpoints, beyond the day-2 message.
//
// WHY: a trial user currently receives 7-9 notifications across three days and
// none of them are about their medication — protein at 11:30, water at 15:30,
// a weigh-in, a trend review. The one that would actually bring a GLP-1 user
// back (their dose reminder) was switched off for everyone by the Root 2 bug.
// So the person decides whether to keep paying without ever being shown the
// thing they downloaded the app for.
//
// These two steps exist to put the level curve and the next dose in front of
// them while the trial is still live.
//
// DELIBERATELY STATIC COPY. A local notification is composed HERE, at purchase
// time, and iOS fires exactly that text days later — it cannot know what the
// user logged in between. Copy that would be wrong for someone who has already
// logged a dose ("log your first dose") is therefore banned: every line has to
// read true whether their curve is full or empty. Making these data-aware means
// re-composing on app foreground, which is a bigger machine than it looks and
// is not what this is.
//
// Also deliberately NOT scheduled in the purchase flow's critical path — see
// trialReminder.service: a throw here must never surface as "purchase failed"
// to someone who was in fact just charged.
//
// Pure and RN-free.

/** How long after purchase the first nudge lands. Long enough to not be a
 *  double-tap on the purchase confirmation, short enough to catch the session. */
export const READY_DELAY_MS = 3 * 60 * 60 * 1000;
/** Evening hour (device local) for the day-one step — clear of the 11:30
 *  protein and 15:30 hydration reminders so it never arrives in a cluster. */
export const DAY_ONE_LOCAL_HOUR = 19;
/** A step landing closer than this to expiry has no trial left to sell. */
export const MIN_ROOM_BEFORE_EXPIRY_MS = 6 * 60 * 60 * 1000;

export const TRIAL_SEQUENCE_IDS = {
  ready: "pepta.trial.ready",
  dayOne: "pepta.trial.day-one",
} as const;

export interface TrialSequenceStep {
  id: string;
  fireAt: Date;
  title: string;
  body: string;
}

export interface PlanTrialSequenceOptions {
  /** entitlement.expirationDate — ISO string, or null for lifetime/none. */
  expirationISO: string | null | undefined;
  /** True only when this purchase actually started a free trial. */
  isTrial: boolean;
  now?: Date;
}

/** The next occurrence of DAY_ONE_LOCAL_HOUR strictly after `after`, local time. */
function nextEveningAfter(after: Date): Date {
  const candidate = new Date(after);
  candidate.setHours(DAY_ONE_LOCAL_HOUR, 0, 0, 0);
  if (candidate.getTime() <= after.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

/**
 * The steps to schedule, in fire order. Empty when there is no trial to
 * support, and individual steps drop out rather than bunching up when the
 * window is too short to hold them.
 */
export function planTrialSequence({
  expirationISO,
  isTrial,
  now = new Date(),
}: PlanTrialSequenceOptions): TrialSequenceStep[] {
  if (!isTrial || !expirationISO) return [];

  const expiresAt = new Date(expirationISO);
  if (Number.isNaN(expiresAt.getTime())) return [];

  const latestUseful = expiresAt.getTime() - MIN_ROOM_BEFORE_EXPIRY_MS;
  const steps: TrialSequenceStep[] = [];

  const readyAt = new Date(now.getTime() + READY_DELAY_MS);
  if (readyAt.getTime() < latestUseful) {
    steps.push({
      id: TRIAL_SEQUENCE_IDS.ready,
      fireAt: readyAt,
      title: "Your tracker's ready",
      // True with a full curve or an empty one — see the header note.
      body: "Open Pepta to see your medication level, your next dose, and where today stands.",
    });
  }

  // A full day in, in the evening — past the point where they have something
  // to look at, before the decision gets made for them.
  const dayOneAt = nextEveningAfter(new Date(now.getTime() + 12 * 60 * 60 * 1000));
  if (dayOneAt.getTime() < latestUseful) {
    steps.push({
      id: TRIAL_SEQUENCE_IDS.dayOne,
      fireAt: dayOneAt,
      title: "How's your week tracking?",
      body: "Your levels, doses and protein are all in one place. Take a look at what Pepta's picked up so far.",
    });
  }

  return steps;
}
