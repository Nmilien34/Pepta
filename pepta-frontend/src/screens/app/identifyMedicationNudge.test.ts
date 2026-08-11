import { describe, expect, it } from 'vitest';
import {
  IDENTIFY_MEDICATION_COPY,
  identifyMedicationCandidate,
  identifyMedicationNudgeKey,
  isUnidentifiedCompound,
} from './identifyMedicationNudge';

const compound = (id: string, name: string) => ({ id, name });
const dose = (compoundId: string, deletedAt: string | null = null) => ({
  compoundId,
  deletedAt,
});

describe('identifyMedicationCandidate', () => {
  it('nudges about a "Something else" compound that has dose logs', () => {
    const result = identifyMedicationCandidate({
      compounds: [compound('c1', 'Something else')],
      doseLogs: [dose('c1'), dose('c1')],
      dismissedKeys: [],
    });

    expect(result).toEqual({
      compoundId: 'c1',
      doseCount: 2,
      nudgeKey: 'identify-medication:c1',
    });
  });

  it('stays silent when the junk compound has no dose logs', () => {
    // Onboarding tap-through noise, not a medication anyone is taking.
    expect(
      identifyMedicationCandidate({
        compounds: [compound('c1', 'Something else')],
        doseLogs: [],
        dismissedKeys: [],
      }),
    ).toBeNull();
  });

  it('ignores soft-deleted dose logs when deciding whether to nudge', () => {
    expect(
      identifyMedicationCandidate({
        compounds: [compound('c1', 'Something else')],
        doseLogs: [dose('c1', '2026-08-01T00:00:00.000Z')],
        dismissedKeys: [],
      }),
    ).toBeNull();
  });

  it('does not count another compound’s doses toward the junk one', () => {
    expect(
      identifyMedicationCandidate({
        compounds: [compound('c1', 'Something else')],
        doseLogs: [dose('c2'), dose('c2')],
        dismissedKeys: [],
      }),
    ).toBeNull();
  });

  it('leaves real medications alone', () => {
    expect(
      identifyMedicationCandidate({
        compounds: [compound('c1', 'Zepbound'), compound('c2', 'Retatrutide')],
        doseLogs: [dose('c1'), dose('c2')],
        dismissedKeys: [],
      }),
    ).toBeNull();
  });

  it('respects a dismissal for that compound', () => {
    expect(
      identifyMedicationCandidate({
        compounds: [compound('c1', 'Something else')],
        doseLogs: [dose('c1')],
        dismissedKeys: ['identify-medication:c1'],
      }),
    ).toBeNull();
  });

  it('still nudges about a DIFFERENT junk compound after one was dismissed', () => {
    // Dismissal binds to the record, not the account — the whole reason the key
    // carries a compound id. A user who says "Not now" once and later creates
    // another unidentified compound has to be askable again.
    const result = identifyMedicationCandidate({
      compounds: [compound('c1', 'Something else'), compound('c2', 'Something else')],
      doseLogs: [dose('c1'), dose('c2')],
      dismissedKeys: ['identify-medication:c1'],
    });

    expect(result?.compoundId).toBe('c2');
  });

  it('returns only one candidate even when several qualify', () => {
    const result = identifyMedicationCandidate({
      compounds: [compound('c1', 'Something else'), compound('c2', 'Something else')],
      doseLogs: [dose('c1'), dose('c2')],
      dismissedKeys: [],
    });

    expect(result?.compoundId).toBe('c1');
  });

  it('matches the name regardless of case and surrounding space', () => {
    expect(isUnidentifiedCompound({ name: '  something else ' })).toBe(true);
    expect(isUnidentifiedCompound({ name: 'Something Else' })).toBe(true);
    expect(isUnidentifiedCompound({ name: 'Something else entirely' })).toBe(false);
    expect(isUnidentifiedCompound({ name: 'Zepbound' })).toBe(false);
  });

  it('keys dismissals per compound', () => {
    expect(identifyMedicationNudgeKey('abc123')).toBe('identify-medication:abc123');
  });
});

describe('IDENTIFY_MEDICATION_COPY', () => {
  it('singularizes a single logged dose', () => {
    expect(IDENTIFY_MEDICATION_COPY.body(1)).toContain('logged dose stays attached');
    expect(IDENTIFY_MEDICATION_COPY.body(4)).toContain('4 logged doses stay attached');
  });

  it('promises the history survives — the reason a user taps through', () => {
    expect(IDENTIFY_MEDICATION_COPY.body(2)).toContain('attached');
  });
});
