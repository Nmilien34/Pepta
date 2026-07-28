import { describe, expect, it } from 'vitest';
import { LIBRARY_ENTRIES } from '../../data/peptideLibrary';
import { buildPepTeachCard, entryForCompound } from './pepTeach';

describe('entryForCompound', () => {
  it('matches a tracked compound to its library entry', () => {
    expect(entryForCompound('BPC-157')?.id).toBeTruthy();
  });

  it('matches on brand aliases and ignores punctuation and case', () => {
    // A user tracks "Zepbound"; the entry is tirzepatide.
    const viaBrand = entryForCompound('Zepbound');
    expect(viaBrand).not.toBeNull();
    expect(entryForCompound('bpc157')?.id).toBe(entryForCompound('BPC-157')?.id);
  });

  it('returns null for nonsense rather than guessing', () => {
    expect(entryForCompound('')).toBeNull();
    expect(entryForCompound('not-a-peptide-xyz')).toBeNull();
  });
});

describe('buildPepTeachCard', () => {
  it('teaches something about what the user actually takes', () => {
    const card = buildPepTeachCard({ compoundNames: ['BPC-157'] });
    expect(card).not.toBeNull();
    expect(card!.title).toContain('BPC-157');
  });

  it('ALWAYS attaches a real citation', () => {
    // The whole defensibility of this feature. A card without a source is
    // indistinguishable from a Reddit comment.
    for (let day = 0; day < 12; day += 1) {
      const card = buildPepTeachCard({ compoundNames: ['Tirzepatide'], dayIndex: day });
      if (!card) continue;
      expect(card.cite.length).toBeGreaterThan(0);
      const entry = LIBRARY_ENTRIES.find((e) => e.id === card.entryId)!;
      expect(entry.sources.some((s) => s.title.trim() === card.cite)).toBe(true);
    }
  });

  it('never repeats an entry the user has already been shown', () => {
    const first = buildPepTeachCard({ compoundNames: ['Tirzepatide'] })!;
    const second = buildPepTeachCard({
      compoundNames: ['Tirzepatide'],
      seenEntryIds: [first.entryId],
    });
    expect(second?.entryId).not.toBe(first.entryId);
  });

  it('goes quiet rather than teaching trivia when there is nothing to say', () => {
    // No compounds and nothing related → no card at all. Silence is a valid
    // state; a health app should not invent a lesson to fill a slot.
    expect(buildPepTeachCard({ compoundNames: [] })).toBeNull();
  });

  it('returns null once everything relevant has been seen', () => {
    const allIds = LIBRARY_ENTRIES.map((e) => e.id);
    expect(
      buildPepTeachCard({ compoundNames: ['BPC-157'], seenEntryIds: allIds }),
    ).toBeNull();
  });

  it('rotates with the day so it is not the same card forever', () => {
    const picks = new Set(
      [0, 1, 2, 3, 4].map(
        (dayIndex) => buildPepTeachCard({ compoundNames: ['Tirzepatide'], dayIndex })?.entryId,
      ),
    );
    expect(picks.size).toBeGreaterThan(1);
  });

  it('survives a negative or huge day index without crashing', () => {
    expect(() => buildPepTeachCard({ compoundNames: ['BPC-157'], dayIndex: -7 })).not.toThrow();
    expect(() => buildPepTeachCard({ compoundNames: ['BPC-157'], dayIndex: 1e6 })).not.toThrow();
  });
});
