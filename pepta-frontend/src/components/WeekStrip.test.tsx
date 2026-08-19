// The strip's whole job is telling four states apart. The version this
// replaces could only say two: a tinted number for taken, a dot for due, and
// nothing at all for BOTH "rest day" and "you were meant to dose and didn't".

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { WeekStrip } from './WeekStrip';
import { one } from '../tests/byLabel';
import type { StripDay } from '../screens/app/scheduleView';

vi.mock('react-native', () => {
  const passthrough = (name: string) =>
    Object.assign(
      ({ children, ...props }: { children?: React.ReactNode }) =>
        React.createElement(name, props, children),
      { displayName: name },
    );
  return { View: passthrough('View'), Text: passthrough('Text'), StyleSheet: { create: (s: unknown) => s } };
});

vi.mock('react-native-svg', () => ({
  default: ({ children }: { children?: React.ReactNode }) => React.createElement('Svg', null, children),
  Svg: ({ children }: { children?: React.ReactNode }) => React.createElement('Svg', null, children),
  Path: (p: { stroke?: string; d?: string }) => React.createElement('Path', p),
}));

vi.mock('./AppText', () => ({
  AppText: ({ children }: { children?: React.ReactNode }) => React.createElement('AppText', null, children),
}));

vi.mock('../theme', () => ({
  useTheme: () => ({
    colors: {
      surface: '#fff',
      surfaceAlt: '#F3F4F7',
      border: '#E8E8EE',
      primary: '#7C5CFC',
      onPrimary: '#fff',
      textPrimary: '#000',
      textTertiary: '#A6A6B0',
    },
  }),
}));


const NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const week = (marks: StripDay['mark'][], todayIndex = 2): StripDay[] =>
  marks.map((mark, i) => ({
    date: `2026-06-${String(22 + i).padStart(2, '0')}`,
    name: NAMES[i]!,
    mark,
    isToday: i === todayIndex,
  }));

async function render(days: StripDay[]) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<WeekStrip days={days} />);
  });
  return tree;
}

/**
 * The mark circle inside a tile, found by the tile's own label. Picked by its
 * full radius rather than by position: findAll includes the tile itself, and
 * an index would quietly start matching the wrong node if the tile ever gains
 * a wrapper.
 */
const markOf = (tree: TestRenderer.ReactTestRenderer, label: string) =>
  one(tree, label, 'View').findAll(
    (n) =>
      String(n.type) === 'View' && (n.props.style as { borderRadius?: number })?.borderRadius === 999,
  )[0]!;

const paths = (tree: TestRenderer.ReactTestRenderer, label: string) =>
  one(tree, label, 'View').findAll((n) => String(n.type) === 'Path');

describe('the four states a mark has to tell apart', () => {
  const days = week(['logged', 'missed', 'none', 'none', 'none', 'due', 'none']);

  it('taken: a filled mark with a check', async () => {
    const tree = await render(days);
    const mark = markOf(tree, 'MON, taken');

    expect(mark.props.style.backgroundColor).toBe('#7C5CFC');
    expect(paths(tree, 'MON, taken')).toHaveLength(1);
  });

  it('missed: a flat mark with a cross — NOT the same as a rest day', async () => {
    const tree = await render(days);
    const missed = markOf(tree, 'TUE, nothing logged');
    const resting = markOf(tree, 'THU, nothing planned');

    expect(paths(tree, 'TUE, nothing logged')).toHaveLength(1);
    expect(paths(tree, 'THU, nothing planned')).toHaveLength(0);
    expect(missed.props.style.borderWidth).not.toBe(resting.props.style.borderWidth);
  });

  it('due: a thick primary ring, and nothing drawn inside it', async () => {
    const tree = await render(days);
    const mark = markOf(tree, 'SAT, due');

    expect(mark.props.style.borderWidth).toBe(3.4);
    expect(mark.props.style.borderColor).toBe('#7C5CFC');
    expect(paths(tree, 'SAT, due')).toHaveLength(0);
  });

  it('resting: a thin grey ring, quieter than due', async () => {
    const tree = await render(days);
    const resting = markOf(tree, 'THU, nothing planned');
    const due = markOf(tree, 'SAT, due');

    expect(resting.props.style.borderWidth).toBe(2.8);
    expect(resting.props.style.borderColor).toBe('#E8E8EE');
    expect(resting.props.style.borderWidth).toBeLessThan(due.props.style.borderWidth);
  });

  it('gives every one of the seven days a distinct, spoken state', async () => {
    const tree = await render(days);

    for (const label of [
      'MON, taken',
      'TUE, nothing logged',
      'WED, today, nothing planned',
      'SAT, due',
    ]) {
      expect(one(tree, label, 'View')).toBeTruthy();
    }
  });
});

describe('today', () => {
  it('changes the tile, not the mark, so today and taken can both be true', async () => {
    const tree = await render(week(['logged', 'none', 'none', 'none', 'none', 'none', 'none'], 0));
    const tile = one(tree, 'MON, today, taken', 'View');

    expect(tile.props.style.backgroundColor).toBe('#EFEBFF');
    // And the mark still reads as taken rather than being overridden.
    expect(markOf(tree, 'MON, today, taken').props.style.backgroundColor).toBe('#7C5CFC');
  });

  it('leaves the other tiles on the plain surface', async () => {
    const tree = await render(week(['none', 'none', 'none', 'none', 'none', 'none', 'none']));

    expect(one(tree, 'MON, nothing planned', 'View').props.style.backgroundColor).toBe('#F3F4F7');
  });
});

describe('what the tiles say', () => {
  it('names the day rather than numbering it', async () => {
    const tree = await render(week(['none', 'none', 'none', 'none', 'none', 'none', 'none']));
    const labels = tree.root
      .findAll((n) => String(n.type) === 'AppText')
      .flatMap((n) => n.children.filter((c) => typeof c === 'string'));

    expect(labels).toEqual(NAMES);
    // The day-of-month numbers the old strip showed are gone entirely.
    expect(labels.some((l) => /^\d+$/.test(String(l)))).toBe(false);
  });
});
