// Pure derivations for the peptide library: search, goal filtering, grouping
// by category, and matching entries to the user's own tracked compounds. No
// RN imports — unit-testable in plain node.

import {
  CATEGORY_META,
  GOAL_META,
  LIBRARY_ENTRIES,
  LIBRARY_STACKS,
  type LibraryCategory,
  type LibraryEntry,
  type LibraryGoal,
  type LibraryStack,
} from '../../data/peptideLibrary';

export interface LibrarySection {
  category: LibraryCategory;
  label: string;
  entries: LibraryEntry[];
}

/** Goal chips, ordered for our audience (GLP-1 first, then peptide goals). */
export const GOAL_FILTERS: ReadonlyArray<{ label: string; value: LibraryGoal | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Weight loss', value: 'weight_loss' },
  { label: 'Recovery', value: 'recovery' },
  { label: 'Performance', value: 'performance' },
  { label: 'Longevity', value: 'longevity' },
  { label: 'Cognitive', value: 'cognitive' },
  { label: 'Immune', value: 'immune' },
  { label: 'Sleep', value: 'sleep' },
  { label: 'Skin', value: 'skin' },
];

function normalize(value: string): string {
  // Fold the punctuation people omit: "bpc157" must find "BPC-157".
  return value.toLowerCase().replace(/[\s\-_.()]/g, '');
}

/** Search across name, alternate names, epithet and summary. */
export function searchEntries(entries: LibraryEntry[], query: string): LibraryEntry[] {
  const q = normalize(query);
  if (q.length === 0) return entries;
  return entries.filter((entry) => {
    const haystack = [entry.name, entry.epithet, entry.summary, ...(entry.aka ?? [])]
      .map(normalize)
      .join('|');
    return haystack.includes(q);
  });
}

export function filterByGoal(
  entries: LibraryEntry[],
  goal: LibraryGoal | 'all',
): LibraryEntry[] {
  if (goal === 'all') return entries;
  return entries.filter((entry) => entry.goals.includes(goal));
}

/** Category sections in CATEGORY_META order, empty ones dropped. */
export function groupByCategory(entries: LibraryEntry[]): LibrarySection[] {
  const order = Object.keys(CATEGORY_META) as LibraryCategory[];
  return order
    .map((category) => ({
      category,
      label: CATEGORY_META[category].label,
      entries: entries.filter((entry) => entry.category === category),
    }))
    .filter((section) => section.entries.length > 0);
}

/** The full list view: search + goal filter + grouping, in one call. */
export function buildLibraryView(input: {
  query: string;
  goal: LibraryGoal | 'all';
}): { sections: LibrarySection[]; stacks: LibraryStack[]; total: number } {
  const filtered = searchEntries(filterByGoal(LIBRARY_ENTRIES, input.goal), input.query);
  // Stacks hide during search (they'd bury entry matches) and follow the goal
  // filter otherwise.
  const stacks =
    input.query.trim().length > 0
      ? []
      : LIBRARY_STACKS.filter(
          (stack) => input.goal === 'all' || stack.goals.includes(input.goal),
        );
  return { sections: groupByCategory(filtered), stacks, total: filtered.length };
}

/**
 * Ids of library entries the user already tracks — drives the "YOU TRACK THIS"
 * chip. Matches on normalized name or any alternate name, so a compound saved
 * as "Zepbound" lights up the tirzepatide entry.
 */
export function trackedEntryIds(
  compoundNames: string[],
): Set<string> {
  const tracked = new Set<string>();
  const names = compoundNames.map(normalize).filter((name) => name.length > 0);
  if (names.length === 0) return tracked;

  for (const entry of LIBRARY_ENTRIES) {
    const candidates = [entry.name, ...(entry.aka ?? [])].map(normalize);
    const hit = names.some((name) =>
      candidates.some(
        (candidate) => candidate === name || name.includes(candidate) || candidate.includes(name),
      ),
    );
    if (hit) tracked.add(entry.id);
  }
  return tracked;
}

/**
 * The question we hand to Pep when you tap "Ask Pep about this". It carries
 * the library's own framing — category, goals, and crucially the EVIDENCE
 * TIER — so Pep answers grounded in what we actually published rather than
 * improvising, and so an unapproved compound is flagged as such in the very
 * first message. Phrased in the user's voice; they can edit before sending.
 */
export function askPepPrompt(entry: LibraryEntry): string {
  // "recovery, sleep and performance" — Oxford-less, reads like a person.
  const labels = entry.goals.map((goal) => GOAL_META[goal].toLowerCase());
  const goals =
    labels.length > 1
      ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
      : (labels[0] ?? 'general use');
  const framing: Record<LibraryEntry['evidence'], string> = {
    fda_approved: 'It’s FDA approved',
    human_trials: 'It’s been studied in humans but isn’t FDA approved',
    preclinical: 'Pepta lists it as preclinical — animal data only',
    community: 'Pepta lists it as community-reported, with no controlled evidence',
  };
  return `I’m reading about ${entry.name} (“${entry.epithet}”) in the Pepta library — it’s used for ${goals}. ${framing[entry.evidence]}. What should I know about it, and how would it fit with what I’m already tracking?`;
}

export function stackEntries(stack: LibraryStack): LibraryEntry[] {
  return stack.entryIds
    .map((id) => LIBRARY_ENTRIES.find((entry) => entry.id === id))
    .filter((entry): entry is LibraryEntry => entry != null);
}
