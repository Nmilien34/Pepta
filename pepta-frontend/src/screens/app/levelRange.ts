// Which curve the medication-level chart is showing, and why.
//
// THE CONTROL THIS DRIVES USED TO BE A LIE. It was a View with no onPress,
// `i === 0` hardcoded so "7d" was always lit, sitting above a curve the
// backend only ever drew +/-7 days — three of its four options had neither
// wiring nor data. It was deleted rather than left as decoration, with a note
// to restore it once the engine took a window. This is that restoration, so
// the rule is: an option is only offered if the server can actually draw it.
//
// WEEK COMES FROM /home, THE REST ARE FETCHED. Home already carries a +/-7 day
// curve, so the default range paints on arrival with no request and no
// spinner. Anything wider is a real call, cached per range so going back to
// one already seen is instant.
//
// Pure and RN-free.

import type { LevelRangeKey, MedicationLevelsResponse } from '@pepta/shared';

export interface LevelRangeOption {
  key: LevelRangeKey;
  label: string;
}

/** Labels are the design's. "All" carries no number because its span is the
 *  user's own history — the server resolves it from their first dose. */
export const LEVEL_RANGES: readonly LevelRangeOption[] = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: '90d' },
  { key: 'all', label: 'All' },
];

export interface LevelPoint {
  datetime: string;
  level: number;
}

export interface HomeLevel {
  compoundId: string;
  curve: readonly LevelPoint[];
  peakEstimate: number;
}

export interface LevelRangeViewInput {
  range: LevelRangeKey;
  /** The doses /track already loaded, used for the week. */
  homeDoses: readonly { datetime: string }[];
  /** The +/-7 day level /home already loaded, for this compound. */
  home: HomeLevel | null;
  /** Ranges fetched so far, keyed by range. */
  fetched: Partial<Record<LevelRangeKey, MedicationLevelsResponse>>;
  loading: boolean;
}

export interface LevelRangeView {
  curve: readonly LevelPoint[];
  /** Dose markers for THIS window — see the envelope's own note on why the
   *  wider ranges cannot reuse /track's 30-day list. */
  doses: readonly { datetime: string }[];
  peak: number;
  /**
   * True only while there is nothing to draw for this range yet. A range being
   * refetched over a curve already on screen is not a loading state — blanking
   * a chart the user is reading to redraw the same shape is worse than a
   * moment of staleness.
   */
  loading: boolean;
  /** Nothing to draw and nothing coming: the empty state, not a spinner. */
  empty: boolean;
}

export function levelRangeView({
  range,
  home,
  homeDoses,
  fetched,
  loading,
}: LevelRangeViewInput): LevelRangeView {
  const served = fetched[range];
  if (served) {
    // The compound home is showing, so switching ranges never switches which
    // medication is plotted underneath the user.
    const match =
      served.levels.find((level) => level.compoundId === home?.compoundId) ?? served.levels[0];
    if (match && match.curve.length > 1) {
      return {
        curve: match.curve,
        doses: served.doses.filter((dose) => dose.compoundId === match.compoundId),
        peak: match.peakEstimate,
        loading: false,
        empty: false,
      };
    }
  }

  // Week is served by /home directly — no request, no wait.
  if (range === 'week' && home && home.curve.length > 1) {
    return {
      curve: home.curve,
      doses: homeDoses,
      peak: home.peakEstimate,
      loading: false,
      empty: false,
    };
  }

  // Falling back to the week curve while a wider one loads would draw seven
  // days under a control that says 90 — the exact lie this replaces.
  return { curve: [], doses: [], peak: 0, loading, empty: !loading };
}
