// When the medication-level curve must NOT be drawn, and what to say instead.
// Pure → testable, and the single source every level surface reads so the
// card, the sparkline, the Peaking/Low pill and Pep's mood can never disagree.
//
// TWO reasons, one shape:
//  · 'oral'      — the engine is single-compartment with INSTANT absorption
//                  (pharmacokinetics.ts): no absorption phase, no
//                  bioavailability. For a daily tablet it superimposes doses
//                  into a number with no physical meaning (a 3 mg Rybelsus
//                  user reading "31.20 mg in your body"), the 7-bar sparkline
//                  aliases the daily cycle into noise, and Peaking/Low
//                  becomes a coin flip. Suppress until there's a real oral
//                  model — do NOT fabricate.
//  · 'unmodeled' — custom medication whose owner skipped the half-life
//                  (2026-08-07). Same suppression, different sentence: that
//                  user can fix theirs by entering a half-life.
//
// Route missing/undefined is treated as INJECTION (curve renders as before),
// matching the injection-site fix's fallback: never guess oral.

import type { HomeResponse, MedicationLevelResponse } from '@pepta/shared';

/**
 * What the user calls taking their medication. Route in, noun out — no
 * per-screen logic, so the later full copy sweep extends THIS instead of
 * inventing a second pattern. Route missing/undefined reads as injection,
 * matching the injection-site fallback: never guess oral.
 */
export function doseNoun(route: string | null | undefined): 'shot' | 'dose' {
  return route === 'oral' ? 'dose' : 'shot';
}

/**
 * The noun for a string that belongs to NO single compound — a Home empty
 * state, a schedule day summary, "hours since your last …".
 *
 * "shot" survives only when EVERY active compound is injectable. That keeps an
 * all-injectable user byte-identical while a user on both an injectable and a
 * pill reads neutral language, instead of being told to log a "shot" on the day
 * their oral dose is due. An empty list reads as injection, matching doseNoun's
 * fallback: never guess oral.
 */
export function globalDoseNoun(
  compounds: readonly { route?: string | null }[] | null | undefined,
): 'shot' | 'dose' {
  const active = compounds ?? [];
  if (active.length === 0) return 'shot';
  return active.every((compound) => compound.route !== 'oral') ? 'shot' : 'dose';
}

/** Capitalized for sentence starts and labels ("Shot day" / "Dose day"). */
export function capitalize(noun: string): string {
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}

export type LevelSuppressionReason = 'oral' | 'unmodeled';

export const LEVEL_SUPPRESSION_COPY: Record<LevelSuppressionReason, string> = {
  oral: 'Level tracking isn’t available for oral medications yet.',
  unmodeled: 'Level tracking isn’t available for this medication.',
};

interface LevelCompound {
  route?: string | null;
  halfLifeDays?: number | null;
}

/** Why this compound's level must not render — or null when it may. */
export function levelSuppressionFor(
  compound: LevelCompound | null | undefined,
): LevelSuppressionReason | null {
  if (!compound) return null;
  // Oral first: it's the more specific explanation for an oral compound that
  // also happens to carry no half-life.
  if (compound.route === 'oral') return 'oral';
  if (compound.halfLifeDays == null) return 'unmodeled';
  return null;
}

export interface ResolvedLevelView {
  /** The level to render, or null when there is nothing renderable. */
  level: MedicationLevelResponse | null;
  /**
   * Set ONLY when every active compound is suppressed — then the surface
   * shows LEVEL_SUPPRESSION_COPY[reason]. When an eligible compound exists
   * but simply has no doses yet, this stays null so the normal
   * "log your first dose" empty state still shows.
   */
  suppressed: LevelSuppressionReason | null;
}

/**
 * PER-COMPOUND, never per-user: a user on both an injectable and an oral
 * keeps the full curve for the injectable and sees suppression only when the
 * oral is all they have.
 */
export function resolveLevelView(home: HomeResponse | null | undefined): ResolvedLevelView {
  if (!home) return { level: null, suppressed: null };

  const active = home.activeCompounds ?? [];
  const levels = home.medicationLevels ?? [];
  const compoundFor = (compoundId: string): LevelCompound | undefined =>
    active.find((compound) => compound.id === compoundId);

  // Renderability turns on ROUTE alone. A missing half-life can't disqualify
  // a level here: the backend never computes one for a half-life-less
  // compound, so a level's existence already proves it was modelable. That
  // reason only ever explains an EMPTY state, below.
  const renderable = levels.filter(
    (level) => levelSuppressionFor(compoundFor(level.compoundId)) !== 'oral',
  );
  const level = renderable[0] ?? null;
  if (level) return { level, suppressed: null };

  if (active.length === 0) return { level: null, suppressed: null };

  // Nothing renderable AND no compound could ever render one → say why.
  const reasons = active.map((compound) => levelSuppressionFor(compound));
  const allSuppressed = reasons.every((reason) => reason != null);
  return { level: null, suppressed: allSuppressed ? reasons[0]! : null };
}
