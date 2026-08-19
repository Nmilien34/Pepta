// "What to show" — which cards Progress renders.
//
// THE JOB THE SLIDERS GLYPH SHOULD HAVE HAD. It promised a filter and opened
// Account; the frame's note puts it plainly — WHEN lives in the pill, WHAT
// lives here.
//
// ONLY SECTIONS THAT EXIST ARE OFFERED — a toggle governing nothing is the
// same decoration as the dead range control and the dead scope pill this
// screen keeps shedding. Side effects was held out for exactly that reason
// until its card was built; it is in the list now because there is something
// for it to govern.
//
// NOTHING IS DELETED, which is why hiding is a display choice held on the
// device rather than a profile field: turning Weight off must never look like
// a reason the server stopped returning weights.
//
// Pure and RN-free.

export type ProgressSectionKey =
  | 'weight'
  | 'sideEffects'
  | 'eating'
  | 'muscle'
  | 'timeline'
  | 'numbers'
  | 'photos';

export interface ProgressSection {
  key: ProgressSectionKey;
  label: string;
  icon: string;
}

/** In the order they appear on the screen, so the sheet reads as a map of it. */
export const PROGRESS_SECTIONS: readonly ProgressSection[] = [
  { key: 'weight', label: 'Weight', icon: 'scale' },
  { key: 'sideEffects', label: 'Side effects', icon: 'alert-circle-outline' },
  { key: 'eating', label: 'What you’re eating', icon: 'nutrition' },
  { key: 'muscle', label: 'Muscle protection', icon: 'shield-check' },
  { key: 'timeline', label: 'Timeline', icon: 'flag' },
  { key: 'numbers', label: 'What your numbers say', icon: 'chart-line' },
  { key: 'photos', label: 'Progress photos', icon: 'camera' },
];

export type ProgressSectionPrefs = Record<ProgressSectionKey, boolean>;

/** Everything on. Someone who has never opened this sheet sees their whole screen. */
export const ALL_SECTIONS_ON: ProgressSectionPrefs = {
  weight: true,
  sideEffects: true,
  eating: true,
  muscle: true,
  timeline: true,
  numbers: true,
  photos: true,
};

/** Versioned, so adding a section later can invalidate cleanly if it must. */
export const PROGRESS_SECTIONS_KEY = 'pepta:progress-sections.v1';

/**
 * Reads stored prefs, defaulting anything unknown to ON.
 *
 * A SECTION ADDED AFTER SOMEONE SAVED THEIR PREFS MUST APPEAR, not vanish:
 * merging over the all-on default means a new card shows up for everyone, and
 * only the keys they actually turned off stay off. Reading the stored object
 * directly would hide every future card from every existing user.
 */
export function parseSectionPrefs(raw: string | null): ProgressSectionPrefs {
  if (!raw) return { ...ALL_SECTIONS_ON };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...ALL_SECTIONS_ON };
    const stored = parsed as Record<string, unknown>;
    const next = { ...ALL_SECTIONS_ON };
    for (const section of PROGRESS_SECTIONS) {
      if (typeof stored[section.key] === 'boolean') {
        next[section.key] = stored[section.key] as boolean;
      }
    }
    return next;
  } catch {
    return { ...ALL_SECTIONS_ON };
  }
}

export function toggleSection(
  prefs: ProgressSectionPrefs,
  key: ProgressSectionKey,
): ProgressSectionPrefs {
  return { ...prefs, [key]: !prefs[key] };
}

/** How many are hidden — the header button shows a dot when any are. */
export function hiddenCount(prefs: ProgressSectionPrefs): number {
  return PROGRESS_SECTIONS.filter((section) => !prefs[section.key]).length;
}
