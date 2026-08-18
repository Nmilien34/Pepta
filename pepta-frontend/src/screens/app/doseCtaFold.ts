// Whether the "Log a shot" section at the foot of the Medication Level card is
// open, and the Close that shuts it.
//
// THE SECTION OPENS ITSELF ON DOSE DAYS. That is the whole behaviour: on a day
// a dose is wanted the card expands on its own, without being asked, because
// the user should not have to go looking for the action on the one day it
// matters. doseCta.ts already answers "is a dose wanted"; this only decides
// whether the user has since waved it away.
//
// THE CLOSE LASTS FOR TODAY. Not forever, and not for one render:
//   · forever would let a single tap permanently remove the primary logging
//     action from Home, and nothing on the card would ever offer it again.
//   · component state would re-open it on the next refresh, which makes the
//     Close read as broken.
// Storing the local day it was closed lapses it at midnight, so the next dose
// day opens on its own — the same contract as Pep's daily fold, deliberately,
// because two collapsing sections on one screen behaving differently is worse
// than either rule.
//
// Closed is not gone: the card keeps a slim "Log a shot" row that re-opens it.
// Collapsing an action must not destroy it.
//
// Pure and RN-free.

export interface DoseCtaFold {
  /** Local YYYY-MM-DD the user closed the section. */
  day: string;
}

/** Versioned alongside the other Home presentation keys. */
export const DOSE_CTA_FOLD_KEY = 'pepta:dose-cta-folded.v1';

/** A corrupt or hand-edited blob reads as "not closed", never a throw. */
export function parseDoseCtaFold(raw: string | null): DoseCtaFold | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { day } = parsed as Record<string, unknown>;
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    return { day };
  } catch {
    return null;
  }
}

/**
 * Is the section open right now?
 *
 * `show` comes from doseCtaState — false means no dose is wanted at all, and
 * then there is no section to open or close.
 */
export function doseCtaExpanded(
  show: boolean,
  fold: DoseCtaFold | null,
  todayOnly: string,
): boolean {
  if (!show) return false;
  // A fold from an earlier day has lapsed. Comparing to today rather than
  // clearing storage at midnight means the lapse needs no timer and survives
  // the app being closed overnight.
  if (fold && fold.day === todayOnly) return false;
  return true;
}
