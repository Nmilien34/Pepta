// What Pep offers to teach today, chosen from the library the app already
// ships. The Duolingo parallel is the tiny daily lesson — NOT a streak — so
// this returns at most one card, it is always dismissible, and it never
// repeats an entry the user has already been shown.
//
// Rules that make this defensible rather than Reddit-with-a-mascot:
//   - Only entries the user is ACTUALLY on, or that sit in the same category,
//     so the lesson is about their own regimen.
//   - Every card carries the entry's evidenceNote and its first real source.
//     No source → no card. Silence beats an unsourced claim on a health app.
//
// Pure and RN-free so the selection logic unit-tests in plain Node.

import { LIBRARY_ENTRIES, type LibraryEntry } from '../../data/peptideLibrary';

export interface PepTeachCard {
  entryId: string;
  /** Entry name, for the "Read it" handoff. */
  entryName: string;
  /** The hook, phrased as a question Pep is offering to answer. */
  title: string;
  /** Two sentences at most — this is a 30-second card, not the detail screen. */
  body: string;
  /** Always present. A card without a citation is never built. */
  cite: string;
}

export interface PepTeachInput {
  /** Names of the compounds the user tracks, e.g. ["Tirzepatide", "BPC-157"]. */
  compoundNames?: string[];
  /** Entry ids already shown — never teach the same thing twice. */
  seenEntryIds?: readonly string[];
  /** Rotates the pick so it is not always the same entry. */
  dayIndex?: number;
}

/** Matches a tracked compound name to a library entry (name or brand alias). */
export function entryForCompound(compoundName: string): LibraryEntry | null {
  const needle = normalize(compoundName);
  if (needle.length === 0) return null;
  return (
    LIBRARY_ENTRIES.find((entry) => {
      if (normalize(entry.name) === needle) return true;
      return (entry.aka ?? []).some((alias) => normalize(alias) === needle);
    }) ?? null
  );
}

export function buildPepTeachCard({
  compoundNames = [],
  seenEntryIds = [],
  dayIndex = 0,
}: PepTeachInput): PepTeachCard | null {
  const seen = new Set(seenEntryIds);

  // Prefer what they actually take; fall back to the same categories so the
  // lesson still relates to their regimen rather than being trivia.
  const owned = compoundNames
    .map(entryForCompound)
    .filter((e): e is LibraryEntry => e !== null);

  const categories = new Set(owned.map((e) => e.category));
  const related = LIBRARY_ENTRIES.filter((e) => categories.has(e.category));

  const pool = [...owned, ...related].filter(
    (entry, i, all) =>
      !seen.has(entry.id) &&
      all.findIndex((e) => e.id === entry.id) === i &&
      hasCitation(entry),
  );

  if (pool.length === 0) return null;

  const entry = pool[Math.abs(dayIndex) % pool.length]!;
  return {
    entryId: entry.id,
    entryName: entry.name,
    title: `Why ${entry.name} is ${entry.epithet.toLowerCase()}`,
    body: entry.evidenceNote,
    cite: firstCitation(entry)!,
  };
}

function hasCitation(entry: LibraryEntry): boolean {
  return firstCitation(entry) !== null;
}

function firstCitation(entry: LibraryEntry): string | null {
  // LibrarySource uses `title` — reaching for `label` here silently produced
  // null for every entry, which would have rendered exactly zero cards.
  const source = entry.sources.find((s) => s.title.trim().length > 0);
  return source ? source.title.trim() : null;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
