// Text that outgrows its line box gets CROPPED, not just crowded.
//
// The weight card read "199.5" with the top of every digit sliced off. The
// cause is a one-liner that looks completely harmless:
//
//   <AppText variant="cardTitle" style={{ fontSize: 26 }}>
//
// `cardTitle` is fontSize 18 / lineHeight 24. Overriding the SIZE leaves the
// LINE BOX behind, so a 26pt glyph is rendered into a 24pt box. React Native
// centres the glyph in exactly that box and crops whatever overflows — there
// is no equivalent of CSS's willingness to let a line grow. (The hub's `.big`
// is `line-height:1`, which the browser resolves generously; RN does not.)
//
// This is the same shape as the fontWeight bug in weightFamily.test.ts: a
// variant carries several coupled values, an override changes one of them, and
// the others silently stop matching. Nothing errors, nothing warns — the
// design is simply wrong on device and looks fine in code review.
//
// So rather than fixing the three sites and hoping, this scans every call site
// and fails on the next one.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { typography } from './typography';

const SRC = join(__dirname, '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules' && entry !== '__fixtures__') sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry) && !entry.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

/** Variants that declare both a size and a line box. */
const VARIANTS = new Map<string, { fontSize: number; lineHeight: number }>(
  Object.entries(typography)
    .filter(
      (entry): entry is [string, { fontSize: number; lineHeight: number }] =>
        !!entry[1] &&
        typeof entry[1] === 'object' &&
        'fontSize' in entry[1] &&
        'lineHeight' in entry[1],
    )
    .map(([name, style]) => [name, { fontSize: style.fontSize, lineHeight: style.lineHeight }]),
);

interface Offender {
  file: string;
  line: number;
  variant: string;
  fontSize: number;
  lineHeight: number;
}

function findOffenders(): Offender[] {
  const found: Offender[] = [];
  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, 'utf8');
    // Each <AppText variant="x" ...> opening tag, with its props.
    for (const match of source.matchAll(/variant="(\w+)"((?:[^>]|\n){0,500}?)>/g)) {
      const variant = VARIANTS.get(match[1]!);
      if (!variant) continue;
      const props = match[2]!;
      // An explicit lineHeight means the author thought about it — their call.
      if (/lineHeight:/.test(props)) continue;
      const size = /fontSize:\s*([\d.]+)/.exec(props);
      if (!size) continue;
      const fontSize = Number(size[1]);
      if (fontSize <= variant.lineHeight) continue;
      found.push({
        file: file.slice(SRC.length + 1),
        line: source.slice(0, match.index).split('\n').length,
        variant: match[1]!,
        fontSize,
        lineHeight: variant.lineHeight,
      });
    }
  }
  return found;
}

describe('no AppText outgrows the line box it inherited', () => {
  it('has no override whose fontSize exceeds its variant lineHeight', () => {
    const offenders = findOffenders();

    // Named in the failure so the fix is obvious: add an explicit lineHeight
    // to that call site (roughly 1.15-1.25x the size), or use a variant whose
    // box already fits.
    const report = offenders
      .map((o) => `${o.file}:${o.line} variant="${o.variant}" fontSize ${o.fontSize} > lineHeight ${o.lineHeight}`)
      .join('\n');

    expect(report, `text will be cropped at these call sites:\n${report}`).toBe('');
  });
});

describe('the scan itself works', () => {
  // A test that can only ever pass is worse than no test. These pin the two
  // halves that could silently stop matching: the variant table, and the
  // detection.
  it('found real variants to check against', () => {
    expect(VARIANTS.size).toBeGreaterThan(5);
    expect(VARIANTS.get('cardTitle')).toEqual({ fontSize: 18, lineHeight: 24 });
  });

  it('would catch the exact bug that prompted this', () => {
    // The weight card, as it shipped.
    const shipped = '<AppText variant="cardTitle" style={{ fontSize: 26, letterSpacing: -0.6 }}>';
    const match = /variant="(\w+)"((?:[^>]|\n){0,500}?)>/.exec(shipped)!;
    const variant = VARIANTS.get(match[1]!)!;

    expect(/lineHeight:/.test(match[2]!)).toBe(false);
    expect(Number(/fontSize:\s*([\d.]+)/.exec(match[2]!)![1])).toBeGreaterThan(variant.lineHeight);
  });

  it('does not flag a call site that sets its own lineHeight', () => {
    const fixed =
      '<AppText variant="cardTitle" style={{ fontSize: 26, lineHeight: 32, letterSpacing: -0.6 }}>';
    const match = /variant="(\w+)"((?:[^>]|\n){0,500}?)>/.exec(fixed)!;

    expect(/lineHeight:/.test(match[2]!)).toBe(true);
  });
});
