// Card headers, against the hub.
//
// design-lab/hub-new-screens.html specifies 23 card headers across Home, Track
// and Progress. TWENTY of them wear the `.ic` chip:
//
//   .ch svg.ic { font-size:18px; padding:8.5px; border-radius:11px;
//                background: color-mix(in srgb, currentColor 13%, transparent) }
//
// Every single one shipped as a bare glyph. Not twenty bugs — one omission,
// because the cards were built from the frame's inline styles and everything
// its classes contribute was skipped. It is why the whole app read flatter and
// lighter than the design rather than one screen doing so.
//
// THREE ARE DELIBERATELY BARE in the hub, and must stay that way: "Get
// started", "Today's Log" and "Mix calculator". A test that just banned bare
// glyphs would quietly "fix" those into being wrong.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');

const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

// ONE SUBTLETY, settled against the frames rather than guessed: Home's Weight
// card is tinted `--primary`, while Progress's "Weight (lbs)", "To goal" and
// "Timeline" are tinted `--weight`. This file used to pin Home's as --weight,
// which contradicted all three Home frames. It is not a blanket rule either
// way — check the frame for the SCREEN, not just the metric.

/** Headers the hub chips, and the accent it tints each with. */
const CHIPPED: Array<[file: string, icon: string, token: string]> = [
  ['components/ActivityFeedCard.tsx', 'history', 'textSecondary'],
  ['components/MedicationLevelCard.tsx', 'chart-line', 'primary'],
  ['components/SideEffectsCard.tsx', 'alert-circle-outline', 'primary'],
  ['screens/app/HomeScreen.tsx', 'run', 'activity'],
  ['screens/app/HomeScreen.tsx', 'needle', 'primary'],
  ['screens/app/HomeScreen.tsx', 'leaf', 'fiber'],
  ['screens/app/HomeScreen.tsx', 'water', 'water'],
  ['screens/app/HomeScreen.tsx', 'restaurant', 'protein'],
  ['screens/app/HomeScreen.tsx', 'scale', 'primary'],
  ['screens/app/ProgressScreen.tsx', 'heart-pulse', 'primary'],
  ['screens/app/ProgressScreen.tsx', 'shield-check', 'fiber'],
  ['screens/app/ProgressScreen.tsx', 'nutrition', 'fiber'],
  ['screens/app/TrackScreen.tsx', 'current-location', 'primary'],
  ['screens/app/WeightDetailScreen.tsx', 'flag', 'weight'],
];

/** Headers the hub leaves bare. Chipping these would be the opposite error. */
const BARE: Array<[file: string, icon: string]> = [
  ['screens/app/HomeScreen.tsx', 'sparkles'], // Get started
  ['screens/app/HomeScreen.tsx', 'list'], // Today's Log
  ['screens/app/TrackScreen.tsx', 'flask'], // Mix calculator
];

describe('every header the hub chips, wears a chip', () => {
  it.each(CHIPPED)('%s — %s is chipped in %s', (file, icon, token) => {
    const source = read(file);

    expect(source).toContain(`<CardIcon name="${icon}"`);
    // and in the accent the hub tints it with
    const decl = new RegExp(`<CardIcon name="${icon}"[^/]*color=\\{theme\\.colors\\.${token}\\}`);
    expect(source).toMatch(decl);
  });

  it('leaves no chipped header rendering a bare glyph of the same icon', () => {
    for (const [file, icon] of CHIPPED) {
      expect(read(file)).not.toContain(`<Icon name="${icon}" size={18}`);
    }
  });
});

describe('the three the hub leaves bare, stay bare', () => {
  it.each(BARE)('%s — %s has no chip', (file, icon) => {
    expect(read(file)).not.toContain(`<CardIcon name="${icon}"`);
  });
});
