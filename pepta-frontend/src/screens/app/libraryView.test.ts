import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_META,
  LIBRARY_ENTRIES,
  LIBRARY_STACKS,
} from '../../data/peptideLibrary';
import {
  askPepPrompt,
  buildLibraryView,
  filterByGoal,
  groupByCategory,
  searchEntries,
  stackEntries,
  trackedEntryIds,
} from './libraryView';
import { entryById } from '../../data/peptideLibrary';

describe('searchEntries', () => {
  it('finds entries by name regardless of punctuation', () => {
    const hits = searchEntries(LIBRARY_ENTRIES, 'bpc157').map((e) => e.id);
    expect(hits).toContain('bpc-157');
    expect(searchEntries(LIBRARY_ENTRIES, 'BPC-157').map((e) => e.id)).toContain('bpc-157');
  });

  it('finds entries by brand / alternate name', () => {
    expect(searchEntries(LIBRARY_ENTRIES, 'zepbound').map((e) => e.id)).toEqual(['tirzepatide']);
    expect(searchEntries(LIBRARY_ENTRIES, 'wegovy').map((e) => e.id)).toEqual(['semaglutide']);
    expect(searchEntries(LIBRARY_ENTRIES, 'ibutamoren').map((e) => e.id)).toEqual(['mk-677']);
  });

  it('finds entries by epithet and returns everything for an empty query', () => {
    expect(searchEntries(LIBRARY_ENTRIES, 'healer').map((e) => e.id)).toContain('bpc-157');
    expect(searchEntries(LIBRARY_ENTRIES, '')).toHaveLength(LIBRARY_ENTRIES.length);
  });

  it('returns nothing for a miss', () => {
    expect(searchEntries(LIBRARY_ENTRIES, 'zzzznotathing')).toHaveLength(0);
  });
});

describe('filterByGoal + groupByCategory', () => {
  it('filters to entries carrying the goal', () => {
    const weight = filterByGoal(LIBRARY_ENTRIES, 'weight_loss');
    expect(weight.map((e) => e.id)).toContain('tirzepatide');
    expect(weight.every((e) => e.goals.includes('weight_loss'))).toBe(true);
    expect(filterByGoal(LIBRARY_ENTRIES, 'all')).toHaveLength(LIBRARY_ENTRIES.length);
  });

  it('groups into non-empty category sections', () => {
    const sections = groupByCategory(LIBRARY_ENTRIES);
    expect(sections.length).toBeGreaterThan(3);
    expect(sections.every((section) => section.entries.length > 0)).toBe(true);
    // Every entry lands in exactly one section.
    const grouped = sections.flatMap((section) => section.entries);
    expect(grouped).toHaveLength(LIBRARY_ENTRIES.length);
  });
});

describe('buildLibraryView', () => {
  it('shows stacks when browsing and hides them while searching', () => {
    const browsing = buildLibraryView({ query: '', goal: 'all' });
    expect(browsing.stacks.length).toBeGreaterThan(0);
    expect(buildLibraryView({ query: 'bpc', goal: 'all' }).stacks).toHaveLength(0);
  });

  it('filters stacks by goal alongside entries', () => {
    const view = buildLibraryView({ query: '', goal: 'weight_loss' });
    expect(view.stacks.every((stack) => stack.goals.includes('weight_loss'))).toBe(true);
    expect(view.sections.every((s) => s.entries.every((e) => e.goals.includes('weight_loss')))).toBe(true);
  });

  it('reports an empty result set for a miss', () => {
    const view = buildLibraryView({ query: 'zzzz', goal: 'all' });
    expect(view.total).toBe(0);
    expect(view.sections).toHaveLength(0);
  });
});

describe('trackedEntryIds', () => {
  it('matches the user’s compounds by name and by brand', () => {
    expect(trackedEntryIds(['Tirzepatide']).has('tirzepatide')).toBe(true);
    expect(trackedEntryIds(['Zepbound']).has('tirzepatide')).toBe(true);
    expect(trackedEntryIds(['BPC-157']).has('bpc-157')).toBe(true);
  });

  it('is empty when nothing is tracked', () => {
    expect(trackedEntryIds([]).size).toBe(0);
    expect(trackedEntryIds(['Something else entirely']).size).toBe(0);
  });
});

describe('askPepPrompt', () => {
  it('carries the evidence tier so Pep starts grounded, not improvising', () => {
    const preclinical = askPepPrompt(entryById('bpc-157')!);
    expect(preclinical).toContain('BPC-157');
    expect(preclinical).toContain('The Healer');
    expect(preclinical).toContain('preclinical — animal data only');

    const approved = askPepPrompt(entryById('tirzepatide')!);
    expect(approved).toContain('It’s FDA approved');

    const trials = askPepPrompt(entryById('mk-677')!);
    expect(trials).toContain('studied in humans but isn’t FDA approved');

    const community = askPepPrompt(entryById('melanotan-2')!);
    expect(community).toContain('community-reported');
  });

  it('never implies approval for an unapproved compound', () => {
    for (const id of ['bpc-157', 'tb-500', 'epitalon', 'melanotan-2']) {
      const prompt = askPepPrompt(entryById(id)!).toLowerCase();
      expect(prompt).not.toContain('it’s fda approved');
      expect(prompt).not.toContain("it's fda approved");
    }
  });

  it('mentions the goals and asks how it fits the user’s tracking', () => {
    const prompt = askPepPrompt(entryById('ipamorelin')!);
    expect(prompt).toContain('recovery');
    expect(prompt).toContain('what I’m already tracking');
  });
});

describe('stacks', () => {
  it('resolve every referenced entry id', () => {
    for (const stack of LIBRARY_STACKS) {
      expect(stackEntries(stack)).toHaveLength(stack.entryIds.length);
    }
  });
});

// Editorial invariants — these keep the library honest as entries are added.
describe('content integrity', () => {
  it('has unique ids', () => {
    const ids = LIBRARY_ENTRIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every entry an evidence level, note and at least one source', () => {
    for (const entry of LIBRARY_ENTRIES) {
      expect(EVIDENCE_META[entry.evidence]).toBeTruthy();
      expect(entry.evidenceNote.length).toBeGreaterThan(40);
      expect(entry.sources.length).toBeGreaterThan(0);
      expect(entry.goals.length).toBeGreaterThan(0);
    }
  });

  it('never claims approval in the card summary of an unapproved compound', () => {
    // The summary is the skimmable card line — it must not imply approval.
    // Body copy MAY say "formerly FDA-approved as Geref" or "not FDA-approved",
    // which is accurate context a skimmer never sees out of context.
    for (const entry of LIBRARY_ENTRIES) {
      if (entry.evidence === 'fda_approved') continue;
      const summary = entry.summary.toLowerCase();
      const claimsApproval =
        (summary.includes('fda-approved') || summary.includes('fda approved')) &&
        !summary.includes('not fda') &&
        !summary.includes('only fda');
      expect(claimsApproval).toBe(false);
    }
  });

  it('labels preclinical entries as animal/lab evidence in the note', () => {
    for (const entry of LIBRARY_ENTRIES.filter((e) => e.evidence === 'preclinical')) {
      const note = entry.evidenceNote.toLowerCase();
      expect(
        note.includes('animal') ||
          note.includes('preclinical') ||
          note.includes('rodent') ||
          note.includes('cell') ||
          note.includes('lab'),
      ).toBe(true);
    }
  });

  it('marks protocol blocks as community practice, never advice', () => {
    // The screen renders a fixed disclaimer; this guards the data itself from
    // sneaking in prescriptive language.
    for (const entry of LIBRARY_ENTRIES) {
      if (!entry.protocol) continue;
      const values = Object.values(entry.protocol).join(' ').toLowerCase();
      expect(values).not.toContain('you should');
      expect(values).not.toContain('recommended dose');
      expect(values).not.toContain('start with');
    }
  });
});
