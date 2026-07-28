// Pure (de)serialization for the in-progress onboarding draft (current step +
// the loose flow answers). No RN imports — the AsyncStorage I/O lives in the
// navigator. A malformed blob parses to null so onboarding just starts fresh.

// BUMP THIS WHENEVER ONBOARDING_STEPS CHANGES SHAPE.
// A saved draft is just a step NAME. Reorder or remove steps and that name
// resumes at a completely different point in the flow — v1 drafts saved at
// `reveal` under the old 36-step order reopened the app at the plan graph,
// so the whole quiz appeared to have vanished. Bumped to v2 for the
// 2026-07-27 restructure; an unrecognised key simply starts fresh.
//
// Deliberately NOT bumped for the `leanMass` insertion (2026-07-28). The rule
// is about steps MOVING: a pure insertion leaves every existing step name
// meaning what it always did, so a v2 draft saved at `lastShot` still resumes
// at `lastShot` — it just skips a beat the user was already past. Bumping
// would discard every in-progress draft to buy nothing.
export const ONBOARDING_DRAFT_KEY = 'pepta.onboarding.v2';

export interface StoredDraft {
  step: string;
  answers: Record<string, unknown>;
}

export function serializeDraft(step: string, answers: Record<string, unknown>): string {
  return JSON.stringify({ step, answers });
}

export function parseDraft(raw: string | null | undefined): StoredDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (
      value &&
      typeof value === 'object' &&
      typeof (value as { step?: unknown }).step === 'string' &&
      (value as { answers?: unknown }).answers &&
      typeof (value as { answers?: unknown }).answers === 'object'
    ) {
      return { step: (value as StoredDraft).step, answers: (value as StoredDraft).answers };
    }
    return null;
  } catch {
    return null;
  }
}
