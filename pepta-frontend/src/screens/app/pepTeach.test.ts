import { describe, expect, it } from 'vitest';
import { LIBRARY_ENTRIES } from '../../data/peptideLibrary';
import {
  buildPepTeachCard,
  entryForCompound,
  resolveTeachCard,
  teachCardForEntryId,
} from './pepTeach';

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

describe('“Not now” means not today — never “next one”', () => {
  const compoundNames = ['Tirzepatide'];
  const TODAY = '2026-08-13';
  const pick = (over: Record<string, unknown> = {}) =>
    resolveTeachCard({ compoundNames, dayIndex: 3, today: TODAY, ...over });

  it('keeps showing the SAME card, folded, for the rest of the day', () => {
    // The bug: onDismiss marked the entry seen, the picker skipped it, and a
    // brand-new lesson appeared instantly — so declining produced something
    // else to decline. A live fold must suppress re-picking entirely.
    const first = pick().card!;
    const after = pick({
      seenEntryIds: [first.entryId],
      fold: { entryId: first.entryId, day: TODAY, collapsed: true },
    });

    expect(after.card!.entryId).toBe(first.entryId);
    expect(after.collapsed).toBe(true);
  });

  it('shows a DIFFERENT lesson the next day', () => {
    const first = pick().card!;
    const tomorrow = resolveTeachCard({
      compoundNames,
      dayIndex: 4,
      today: '2026-08-14',
      seenEntryIds: [first.entryId],
      fold: { entryId: first.entryId, day: TODAY, collapsed: true }, // yesterday's, lapsed
    });

    expect(tomorrow.card!.entryId).not.toBe(first.entryId);
    expect(tomorrow.collapsed).toBe(false);
  });

  it('gives back the SAME lesson when the user reopens what they folded', () => {
    // The trap: "Not now" marks the entry seen, so an unpinned expand would
    // re-run the picker and hand back someone else's card — the user taps the
    // chevron to reread what they just folded and gets a different lesson.
    const first = pick().card!;
    const reopened = pick({
      seenEntryIds: [first.entryId],
      fold: { entryId: first.entryId, day: TODAY, collapsed: false },
    });

    expect(reopened.card!.entryId).toBe(first.entryId);
    expect(reopened.collapsed).toBe(false);
  });

  it('opens expanded when nothing is folded', () => {
    expect(pick({ fold: null }).collapsed).toBe(false);
    expect(pick().collapsed).toBe(false);
  });

  it('falls back to a normal pick if the folded entry no longer exists', () => {
    // A library rework can delete an entry out from under a stored fold.
    const resolved = pick({
      fold: { entryId: 'entry-that-was-removed', day: TODAY, collapsed: true },
    });
    expect(resolved.card).not.toBeNull();
    expect(resolved.collapsed).toBe(false);
  });

  it('never resurrects a card the user read and moved past', () => {
    const first = pick().card!;
    const next = pick({ seenEntryIds: [first.entryId], fold: null });
    expect(next.card!.entryId).not.toBe(first.entryId);
  });
});

describe('teachCardForEntryId', () => {
  it('rebuilds a card by id with its citation intact', () => {
    const entry = LIBRARY_ENTRIES.find((e) => e.sources.some((s) => s.title.trim()))!;
    const card = teachCardForEntryId(entry.id);
    expect(card?.entryId).toBe(entry.id);
    expect(card?.cite.length).toBeGreaterThan(0);
  });

  it('returns null for an unknown id rather than a blank card', () => {
    expect(teachCardForEntryId('nope')).toBeNull();
  });
});
