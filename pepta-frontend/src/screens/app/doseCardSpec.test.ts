// The Medication Level card, against its frame.
//
// The frame folds the action away and back between two hairlines:
//
//   collapsed:  <hairline>  ( ⌄ Log a shot )        <- pill: --alt / --ts
//   expanded:   <hairline>  ⏱ Next shot in 4h
//               <button class="logcta[ still]">＋ Log a shot</button>
//               <hairline>  ( ⌃ Close )             <- the same pill
//
// Both handles are the SAME quiet pill. The build had Close right and the
// collapsed one as bare purple text, which put a second purple element
// immediately under the level reading and made the card's quietest control
// compete with its loudest number.
//
// The header wore a bare glyph like every other card — see CardIcon.
//
// The heartbeat is already correct and is pinned here so it stays that way:
// the frame beats `.logcta` for the FIRST dose only and marks every later one
// `.still`, because "the heartbeat teaches the FIRST dose and is retired for
// good after it. A returning user's Home never twitches."

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { doseCtaState } from './doseCta';

const home = readFileSync(join(__dirname, 'HomeScreen.tsx'), 'utf8');

/** Just the fold, so assertions cannot match another card's pill. */
const fold = (() => {
  const start = home.indexOf('function DoseCtaSection');
  expect(start).toBeGreaterThan(-1);
  const end = home.indexOf('\nconst GHOST_BARS', start);
  return home.slice(start, end > start ? end : undefined);
})();

describe('the medication level card matches its frame', () => {
  it('gives both header variants the .ic chip', () => {
    // Two cards render this header — the one with a level and the empty one —
    // and both shipped a bare needle glyph.
    expect(home).not.toContain('<Icon name="needle"');
    expect(home.match(/<CardIcon name="needle"/g)).toHaveLength(2);
  });
});

describe('the fold sits between two hairlines', () => {
  it('puts a rule above the collapsed handle', () => {
    const collapsed = fold.slice(0, fold.indexOf('<LogDoseCta'));
    expect(collapsed).toContain('borderTopWidth: 0.5');
  });

  it('puts a rule above Close too', () => {
    const expanded = fold.slice(fold.indexOf('<LogDoseCta'));
    expect(expanded).toContain('borderTopWidth: 0.5');
  });

  it('uses the SAME quiet pill for both handles, never purple text', () => {
    // --alt background, --ts text, 3/12 padding, fully rounded — twice.
    expect(fold.match(/backgroundColor: theme\.colors\.surfaceAlt/g)).toHaveLength(2);
    expect(fold.match(/paddingHorizontal: 12/g)).toHaveLength(2);
    expect(fold).not.toContain('color: theme.colors.primary');
  });

  it('points the chevron the way the fold will move', () => {
    expect(fold).toContain('chevron-down');
    expect(fold).toContain('chevron-up');
  });
});

describe('the heartbeat is retired after the first dose', () => {
  const today = new Date('2026-08-21T12:00:00Z');
  const dose = (datetime: string) => ({ datetime, deletedAt: null }) as never;

  it('beats for someone who has never logged a dose', () => {
    const first = doseCtaState({ schedules: [], cycles: [], doseLogs: [], today });

    expect(first).toMatchObject({ pulse: true, reason: 'first-dose' });
  });

  it('does NOT beat while Track is still loading', () => {
    // doseLogs === null means "not loaded", not "none". Falling into the
    // empty-array branch made a returning user's button beat on every cold
    // launch until Track arrived — the frame is explicit that a returning
    // Home never twitches. The module already guards schedules === null the
    // same way; this is the missing twin.
    const loading = doseCtaState({ schedules: null, cycles: null, doseLogs: null, today });

    expect(loading.pulse).toBe(false);
  });

  it('never beats once a dose exists', () => {
    const returning = doseCtaState({
      schedules: null,
      cycles: null,
      doseLogs: [dose('2026-08-18T09:00:00Z')],
      today,
    });

    expect(returning.pulse).toBe(false);
  });
});
