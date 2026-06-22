// Pure (de)serialization for the in-progress onboarding draft (current step +
// the loose flow answers). No RN imports — the AsyncStorage I/O lives in the
// navigator. A malformed blob parses to null so onboarding just starts fresh.

export const ONBOARDING_DRAFT_KEY = 'pepta.onboarding.v1';

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
