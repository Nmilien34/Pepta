import { describe, expect, it } from 'vitest';
import type { DataHealthCard } from '@pepta/shared';
import {
  dataHealthCopy,
  describeDuplicateCandidate,
  suggestedKeeper,
} from './dataHealth';

const candidate = (over: Partial<{
  compoundId: string;
  name: string;
  route: string | null;
  plannedDose: number | null;
  doseUnit: string;
  doseCount: number;
  scheduleSummary: string | null;
  createdAt: string;
}> = {}) => ({
  compoundId: 'c1',
  name: 'Foundayo',
  route: 'oral',
  plannedDose: 2.5,
  doseUnit: 'mg',
  doseCount: 2,
  scheduleSummary: 'Daily at 09:00',
  createdAt: '2026-08-10T22:34:00.000Z',
  ...over,
});

describe('dataHealthCopy', () => {
  it('writes duplicate copy without claiming which record is right', () => {
    const copy = dataHealthCopy({
      detector: 'duplicate-compounds',
      key: 'duplicate-compounds:c1:aaaaaaaaaaaa',
      candidates: [candidate(), candidate({ compoundId: 'c2' })],
    } as DataHealthCard);

    expect(copy.title).toContain('Foundayo');
    expect(copy.title).toContain('2 copies');
    // "keep both" has to be visible in the ask, not buried in the sheet —
    // titration is a legitimate reason to have two records.
    expect(copy.body).toMatch(/keep both/i);
  });

  it('names the guess it is replacing in the missing-time card', () => {
    const copy = dataHealthCopy({
      detector: 'missing-dose-time',
      key: 'missing-dose-time:s1:aaaaaaaaaaaa',
      scheduleId: 's1',
      compoundId: 'c1',
      compoundName: 'Foundayo',
      frequency: 'daily',
    } as DataHealthCard);

    expect(copy.title).toBe('When do you usually take Foundayo?');
    expect(copy.body).toContain('9:00 AM');
  });

  it('promises the rename keeps history, and singularizes one dose', () => {
    const one = dataHealthCopy({
      detector: 'unidentified-medication',
      key: 'unidentified-medication:c1:aaaaaaaaaaaa',
      compoundId: 'c1',
      doseCount: 1,
    } as DataHealthCard);
    const many = dataHealthCopy({
      detector: 'unidentified-medication',
      key: 'unidentified-medication:c1:aaaaaaaaaaaa',
      compoundId: 'c1',
      doseCount: 4,
    } as DataHealthCard);

    expect(one.body).toContain('logged dose stays attached');
    expect(many.body).toContain('4 logged doses stay attached');
  });

  it('never uses research language in any card', () => {
    const cards: DataHealthCard[] = [
      {
        detector: 'duplicate-compounds',
        key: 'duplicate-compounds:c1:aaaaaaaaaaaa',
        candidates: [candidate(), candidate({ compoundId: 'c2' })],
      },
      {
        detector: 'missing-dose-time',
        key: 'missing-dose-time:s1:aaaaaaaaaaaa',
        scheduleId: 's1',
        compoundId: 'c1',
        compoundName: 'Foundayo',
        frequency: 'daily',
      },
      {
        detector: 'unidentified-medication',
        key: 'unidentified-medication:c1:aaaaaaaaaaaa',
        compoundId: 'c1',
        doseCount: 2,
      },
    ];

    for (const card of cards) {
      const copy = dataHealthCopy(card);
      const text = `${copy.title} ${copy.body}`.toLowerCase();
      expect(text).not.toMatch(/research|compound\b|peptide|protocol/);
    }
  });
});

describe('describeDuplicateCandidate', () => {
  it('leads with the difference that decides it — the dose', () => {
    expect(describeDuplicateCandidate(candidate())).toBe(
      '2.5 mg · Daily at 09:00 · 2 doses logged',
    );
  });

  it('says so plainly when a record has no history', () => {
    expect(describeDuplicateCandidate(candidate({ doseCount: 0 }))).toContain(
      'No doses logged',
    );
  });

  it('singularizes a single dose', () => {
    expect(describeDuplicateCandidate(candidate({ doseCount: 1 }))).toContain(
      '1 dose logged',
    );
  });

  it('drops fields the record does not have', () => {
    expect(
      describeDuplicateCandidate(
        candidate({ plannedDose: null, scheduleSummary: null, doseCount: 0 }),
      ),
    ).toBe('No doses logged');
  });
});

describe('suggestedKeeper', () => {
  it('preselects the record carrying the most dose history', () => {
    // Vickie's real pair: the second record is the one she actually used.
    expect(
      suggestedKeeper([
        candidate({ compoundId: 'c1', doseCount: 0, createdAt: '2026-08-10T21:28:00.000Z' }),
        candidate({ compoundId: 'c2', doseCount: 2, createdAt: '2026-08-10T22:34:00.000Z' }),
      ]),
    ).toBe('c2');
  });

  it('breaks a history tie with the newer record', () => {
    expect(
      suggestedKeeper([
        candidate({ compoundId: 'old', doseCount: 1, createdAt: '2026-08-01T00:00:00.000Z' }),
        candidate({ compoundId: 'new', doseCount: 1, createdAt: '2026-08-09T00:00:00.000Z' }),
      ]),
    ).toBe('new');
  });

  it('returns null with nothing to choose from', () => {
    expect(suggestedKeeper([])).toBeNull();
  });
});
