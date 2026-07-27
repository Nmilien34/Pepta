// Labeled dosing ranges used ONLY for the mix calculator's advisory note.
// Sourced from FDA prescribing information (see docs/glp1-clinical-reference
// and SourcesScreen citations) — the same citation discipline as the rest of
// Pepta. Compounds without an approved label (research peptides) return null:
// no sourced range means NO warning, never an invented one. The note advises
// and routes to the prescriber; it never blocks and never recommends.

export interface DoseRange {
  minMcg: number;
  maxMcg: number;
  label: string;
  source: string;
}

const RANGES: Array<{ match: RegExp; range: DoseRange }> = [
  {
    match: /tirzepatide|zepbound|mounjaro/i,
    range: {
      minMcg: 2_500,
      maxMcg: 15_000,
      label: '2.5–15 mg weekly',
      source: 'FDA label (Zepbound/Mounjaro)',
    },
  },
  {
    match: /semaglutide|wegovy|ozempic/i,
    range: {
      minMcg: 250,
      maxMcg: 2_400,
      label: '0.25–2.4 mg weekly',
      source: 'FDA label (Wegovy/Ozempic)',
    },
  },
  {
    match: /liraglutide|saxenda|victoza/i,
    range: {
      minMcg: 600,
      maxMcg: 3_000,
      label: '0.6–3 mg daily',
      source: 'FDA label (Saxenda/Victoza)',
    },
  },
];

export function doseRangeFor(compoundName: string): DoseRange | null {
  const entry = RANGES.find((candidate) => candidate.match.test(compoundName));
  return entry?.range ?? null;
}

/** Non-null when the dose sits outside the sourced labeled range. */
export function doseAdvisory(
  compoundName: string,
  doseMcg: number,
): { range: DoseRange; direction: 'above' | 'below' } | null {
  const range = doseRangeFor(compoundName);
  if (!range) return null;
  if (doseMcg > range.maxMcg) return { range, direction: 'above' };
  if (doseMcg < range.minMcg) return { range, direction: 'below' };
  return null;
}
