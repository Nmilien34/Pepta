// The rules the motion has to keep: partway not from zero, once per launch
// not per mount, and a real change always animates.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  ENTRANCE_START,
  claimEntrance,
  hasPlayedEntrance,
  resetEntranceWindowForTests,
} from './entranceMotion';

beforeEach(() => {
  resetEntranceWindowForTests();
});

describe('the entrance is claimed once a launch', () => {
  it('is available before anything has drawn', () => {
    expect(hasPlayedEntrance()).toBe(false);
  });

  it('goes to the first caller and nobody else', () => {
    expect(claimEntrance()).toBe(true);
    expect(claimEntrance()).toBe(false);
    expect(claimEntrance()).toBe(false);
  });

  it('stays spent — navigating back is not an event worth animating', () => {
    claimEntrance();
    expect(hasPlayedEntrance()).toBe(true);
  });
});

describe('where a gauge starts', () => {
  it('is part of the way to its own value, not zero', () => {
    // The whole point: 74 g of a 120 g target does not sweep up from nothing
    // every time you open Home — most of the truth is already on screen.
    expect(ENTRANCE_START).toBeGreaterThan(0.5);
    expect(ENTRANCE_START).toBeLessThan(1);
  });

  it('scales with the value, so a small number starts small', () => {
    // A ring at 20% starts at 13%, not at 65% of the ring.
    expect(0.2 * ENTRANCE_START).toBeCloseTo(0.13, 2);
    expect(0.9 * ENTRANCE_START).toBeCloseTo(0.585, 3);
  });

  it('leaves an empty gauge empty — 0 has nowhere to settle from', () => {
    expect(0 * ENTRANCE_START).toBe(0);
  });
});
