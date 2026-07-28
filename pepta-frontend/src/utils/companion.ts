// The companion's name. One resolver so no screen ever hardcodes "Pep" again —
// the name appears in ~12 user-visible strings including push titles, and every
// one of them has to change the moment the user picks something else.
//
// Pure and RN-free so it unit-tests in plain Node.

/** Fallback when the user has not chosen a name. Ties to "Pepta". */
export const DEFAULT_COMPANION_NAME = 'Pep';

/** Longest a chosen name may be — matches the schema's max(16). */
export const COMPANION_NAME_MAX = 16;

/**
 * Preset suggestions offered as chips. Deliberately warm and a bit silly:
 * this is the one place in a medication tracker where being playful is safe.
 */
export const COMPANION_NAME_PRESETS = [
  'Pep',
  'Sushi',
  'Bob',
  'Ollie',
  'Ivy',
  'Pip',
  'Momo',
  'Gus',
  'Bean',
  'Nugget',
  'Waffle',
  'Otto',
  'Noodle',
] as const;

/**
 * The name to show, given whatever the profile holds. Tolerates null/undefined
 * and whitespace-only values — all of which mean "they never picked one".
 */
export function resolveCompanionName(
  raw?: string | null,
): string {
  const trimmed = (raw ?? '').trim();
  if (trimmed.length === 0) return DEFAULT_COMPANION_NAME;
  return trimmed.slice(0, COMPANION_NAME_MAX);
}

/** Whether a candidate is acceptable to save. Empty is valid — it means Pep. */
export function isValidCompanionName(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.length <= COMPANION_NAME_MAX;
}

/**
 * Normalises for saving: returns undefined when the user left it at the
 * default, so we never persist "Pep" and can tell "unset" from "chose Pep".
 */
export function companionNameForSave(raw: string): string | undefined {
  const trimmed = raw.trim().slice(0, COMPANION_NAME_MAX);
  if (trimmed.length === 0) return undefined;
  if (trimmed === DEFAULT_COMPANION_NAME) return undefined;
  return trimmed;
}

/** A preset that is not the current pick — for the "Surprise me" die. */
export function randomCompanionName(current: string, roll = Math.random()): string {
  const options = COMPANION_NAME_PRESETS.filter((n) => n !== current.trim());
  if (options.length === 0) return DEFAULT_COMPANION_NAME;
  const index = Math.min(options.length - 1, Math.floor(roll * options.length));
  return options[index]!;
}
