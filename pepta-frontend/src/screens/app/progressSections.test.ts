import { describe, expect, it } from 'vitest';
import {
  ALL_SECTIONS_ON,
  PROGRESS_SECTIONS,
  hiddenCount,
  parseSectionPrefs,
  toggleSection,
} from './progressSections';

describe('what the sheet offers', () => {
  it('lists only sections the screen actually renders', () => {
    // The frame lists a Side effects row; that card is not built. A toggle
    // governing nothing is the decoration this screen keeps shedding.
    expect(PROGRESS_SECTIONS.map((s) => s.key)).toEqual([
      'weight',
      'eating',
      'muscle',
      'timeline',
      'numbers',
      'photos',
    ]);
    expect(PROGRESS_SECTIONS.some((s) => s.key === ('sideEffects' as never))).toBe(false);
  });

  it('gives every row a label and an icon', () => {
    for (const section of PROGRESS_SECTIONS) {
      expect(section.label.length).toBeGreaterThan(0);
      expect(section.icon.length).toBeGreaterThan(0);
    }
  });
});

describe('reading stored preferences', () => {
  it('shows everything to someone who has never opened the sheet', () => {
    expect(parseSectionPrefs(null)).toEqual(ALL_SECTIONS_ON);
  });

  it('keeps what they turned off', () => {
    expect(parseSectionPrefs(JSON.stringify({ eating: false })).eating).toBe(false);
  });

  it('DEFAULTS A NEW SECTION ON, rather than hiding it from existing users', () => {
    // Prefs saved before "numbers" existed. Reading the stored object
    // directly would hide every future card from everyone who had ever
    // touched this sheet.
    const old = JSON.stringify({ weight: true, eating: false });
    const prefs = parseSectionPrefs(old);

    expect(prefs.numbers).toBe(true);
    expect(prefs.photos).toBe(true);
    expect(prefs.eating).toBe(false);
  });

  it('ignores rubbish rather than blanking the screen', () => {
    expect(parseSectionPrefs('not json')).toEqual(ALL_SECTIONS_ON);
    expect(parseSectionPrefs('[]')).toEqual(ALL_SECTIONS_ON);
    expect(parseSectionPrefs(JSON.stringify({ weight: 'yes' }))).toEqual(ALL_SECTIONS_ON);
  });
});

describe('toggling', () => {
  it('flips one and leaves the rest', () => {
    const next = toggleSection(ALL_SECTIONS_ON, 'muscle');

    expect(next.muscle).toBe(false);
    expect(next.weight).toBe(true);
    // And does not mutate what it was handed.
    expect(ALL_SECTIONS_ON.muscle).toBe(true);
  });

  it('goes back on', () => {
    expect(toggleSection(toggleSection(ALL_SECTIONS_ON, 'photos'), 'photos').photos).toBe(true);
  });

  it('counts what is hidden, for the header', () => {
    expect(hiddenCount(ALL_SECTIONS_ON)).toBe(0);
    expect(hiddenCount(toggleSection(ALL_SECTIONS_ON, 'weight'))).toBe(1);
  });
});
