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

/** The six offered as chips. The rest are what "Surprise me" reveals. */
export const COMPANION_CHIP_NAMES = ['Pep', 'Ollie', 'Ivy', 'Otto', 'Gus', 'Pip'] as const;

/**
 * What the die can land on: everything NOT already on screen. Rolling a name
 * the user can see is not a surprise, it is a shorter way to tap a chip.
 */
export const SURPRISE_POOL: readonly string[] = COMPANION_NAME_PRESETS.filter(
  (n) => !(COMPANION_CHIP_NAMES as readonly string[]).includes(n),
);

/**
 * The die, as a shuffle bag rather than a coin.
 *
 * Sampling with replacement is what makes a "random" button feel broken: roll
 * three times and you see Waffle, Waffle, Bean, and it reads as a bug rather
 * than a shuffle. Excluding what has already come up means every roll shows
 * something new until the pool is exhausted, and only then does it refill —
 * so a user rolling repeatedly meets the whole cast before anything repeats.
 *
 * Pure: `seen` and `roll` are passed in, so the sequence is fully testable.
 */
export function surpriseCompanionName(
  current: string,
  seen: ReadonlySet<string> = new Set(),
  roll = Math.random(),
): string {
  const currentName = current.trim();
  const fresh = SURPRISE_POOL.filter((n) => n !== currentName && !seen.has(n));
  // Bag empty: refill, still never handing back what is already shown.
  const options = fresh.length > 0 ? fresh : SURPRISE_POOL.filter((n) => n !== currentName);
  if (options.length === 0) return DEFAULT_COMPANION_NAME;
  const index = Math.min(options.length - 1, Math.floor(roll * options.length));
  return options[index]!;
}
