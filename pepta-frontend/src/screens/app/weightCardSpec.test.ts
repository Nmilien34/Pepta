// The Home weight card, against the frame it was drawn from.
//
// What shipped was a different card wearing the same data. The frame is a
// STATUS card — "Weight", the reading, the route to the goal. What was built
// was a NUDGE: a "SCALE CHECK" eyebrow, "Today's weigh-in?" as the title, a
// sentence of encouragement, and the number demoted to a corner. Design says:
//
//   <span class="nm">Weight</span>  <span class="pill">4.5 lb to go</span>
//   <div class="big">199.5<span class="unit"> lb</span></div>
//   <div class="lab">Last check Jun 24</div>
//   … seven dot columns, each with its own label …
//   Next marker <b>195 lb</b> — 4.5 lb away.
//   <button class="logcta" style="background:var(--alt);color:#5E636E">Log weight</button>
//
// The worst of it was the track. The frame draws marks on a route and labels
// every one (now / 195 / 190 / 185 / 180 / 175 / 170); the build drew unlabelled
// dots joined by a rail. A milestone track that cannot name its milestones is a
// progress bar with extra steps, which is the exact thing it replaced.
//
// Source-level, because HomeScreen pulls in the whole app shell. Brittle to
// refactors on purpose: these are the details that silently regressed once.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'HomeScreen.tsx'), 'utf8');

/** Just the weight card + its track, so assertions cannot match another card. */
const card = (() => {
  const start = source.indexOf('function MilestoneTrackView');
  const end = source.indexOf('function HomeActivityCard');
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, end > start ? end : undefined);
})();

describe('the weight card matches the frame', () => {
  it('is titled "Weight" — not an eyebrow and a question', () => {
    expect(card).toContain('Weight\n');
    expect(card).not.toContain('Scale check');
    expect(card).not.toContain('SCALE CHECK');
  });

  it('puts the distance in a pill beside the title', () => {
    expect(card).toContain('goal.trackLabel');
  });

  it('shows when the reading was taken', () => {
    expect(card).toContain('Last check ${goal.dateLabel}');
  });

  it('drops the encouragement line the frame never had', () => {
    expect(card).not.toContain('No pressure');
  });

  it('gives the icon the frame\'s .ic chip, not a bare glyph', () => {
    // .ch svg.ic { padding:8.5px; border-radius:11px;
    //              background: color-mix(in srgb, currentColor 13%, transparent) }
    // A bare glyph left this title row visibly lighter than every other card.
    // The chip now lives in the shared CardIcon — every card header wears one,
    // and it was dropped from all of them the same way. Assert the card USES it
    // rather than re-implementing the padding inline.
    expect(card).toContain('<CardIcon name="scale"');
  });

  it('sizes the unit below the reading, not equal to it', () => {
    // .big is 26px/800 accent; .unit is 15px/700 secondary. One string at one
    // size made "lb" shout as loudly as the number.
    expect(card).toContain('fontSize: 26');
    expect(card).toContain('fontSize: 15, color: theme.colors.textSecondary');
    // latestLabel survives as the null-check; what must not come back is the
    // combined string being RENDERED at one size.
    expect(card).not.toContain('{hasWeight ? pulse.latestLabel');
  });

  it('uses the frame\'s button metrics', () => {
    expect(card).toContain('height: 44');
    expect(card).toContain('LOGCTA_TEXT');
  });
});

describe('the milestone track matches the frame', () => {
  it('labels every mark — the whole reason it is not a progress bar', () => {
    // markers rendered as their own numbers, plus "now" and the goal.
    expect(card).toContain("label: 'now'");
    expect(card).toContain('label: String(mark)');
    expect(card).toContain('label: String(track.goal)');
  });

  it('has no connecting rail between the dots', () => {
    // The rail was the tell that a progress bar was still underneath.
    expect(card).not.toMatch(/flex: 1, height: 2, backgroundColor/);
  });

  it('spaces the marks evenly, each column carrying its own label', () => {
    expect(card).toContain("flex: 1, alignItems: 'center'");
  });

  it('haloes the current position so it reads as a position', () => {
    expect(card).toContain('WEIGHT_GLOW');
    expect(card).toContain('borderWidth: 4');
  });

  it('ends on a flag', () => {
    expect(card).toContain("name=\"flag\"");
  });

  it('states the distance as one sentence, not two ends of a row', () => {
    expect(card).toContain('away.');
    expect(card).not.toMatch(/justifyContent: 'space-between'[\s\S]{0,200}Next marker/);
  });
});
