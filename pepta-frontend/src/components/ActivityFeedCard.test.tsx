// "Your log" in both its homes: the card on Track, and the full screen behind
// See all. One component, so a row cannot read one way in one and another way
// in the other.

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityFeedCard } from './ActivityFeedCard';
import { duplicateLabels, maybeOne, one } from '../tests/byLabel';
import type { ActivityDay } from '../screens/app/activityFeed';

vi.mock('react-native', () => {
  const passthrough = (name: string) =>
    Object.assign(
      ({ children, ...props }: { children?: React.ReactNode }) =>
        React.createElement(name, props, children),
      { displayName: name },
    );
  return {
    Pressable: passthrough('Pressable'),
    View: passthrough('View'),
    Text: passthrough('Text'),
    StyleSheet: { create: (s: unknown) => s },
  };
});

vi.mock('expo-haptics', () => ({ selectionAsync: vi.fn(() => Promise.resolve()) }));

vi.mock('./AppText', () => ({
  AppText: ({ children }: { children?: React.ReactNode }) => React.createElement('AppText', null, children),
}));
vi.mock('./Card', () => ({
  Card: ({ children }: { children?: React.ReactNode }) => React.createElement('Card', null, children),
}));
vi.mock('./Icon', () => ({ Icon: (p: { name: string }) => React.createElement('Icon', p) }));
vi.mock('../theme', () => ({
  useTheme: () => ({
    colors: { border: '#eee', primary: '#7C5CFC', textSecondary: '#666', textTertiary: '#999' },
    spacing: { sm: 8, md: 12, lg: 16 },
  }),
}));

const days: ActivityDay[] = [
  {
    date: '2026-08-13',
    label: 'Today',
    entries: [
      { id: 'dose-d1', kind: 'dose', title: 'Zepbound · 5 mg', detail: 'Left abdomen', datetime: '2026-08-13T09:04:00.000Z' },
      { id: 'weight-w1', kind: 'weight', title: '230 lb', detail: 'Down 1.2 lb this week', datetime: '2026-08-13T07:20:00.000Z' },
      { id: 'protein-p1', kind: 'protein', title: '42 g protein', detail: 'Of 140 g today', datetime: '2026-08-13T08:15:00.000Z' },
    ],
  },
  {
    date: '2026-08-12',
    label: 'Yesterday',
    entries: [
      { id: 'se-s1', kind: 'sideEffect', title: 'Nausea · mild', detail: '2 days after your dose', datetime: '2026-08-12T18:40:00.000Z' },
    ],
  },
];

const onSeeAll = vi.fn();
const onOpenShot = vi.fn();

async function render(props: Partial<Parameters<typeof ActivityFeedCard>[0]> = {}) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <ActivityFeedCard days={days} onSeeAll={onSeeAll} onOpenShot={onOpenShot} {...props} />,
    );
  });
  return tree;
}

const texts = (tree: TestRenderer.ReactTestRenderer): string[] => {
  const out: string[] = [];
  const walk = (n: TestRenderer.ReactTestInstance) => {
    for (const c of n.children) {
      if (typeof c === 'string') out.push(c);
      else walk(c);
    }
  };
  walk(tree.root);
  return out;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('what the feed shows', () => {
  it('groups by day and keeps every row, both lines', async () => {
    const tree = await render();
    const copy = texts(tree);

    expect(copy).toContain('Today');
    expect(copy).toContain('Yesterday');
    expect(copy).toContain('Zepbound · 5 mg');
    // The detail line is the part that makes a bare number legible.
    expect(copy).toContain('Down 1.2 lb this week');
    expect(copy).toContain('Of 140 g today');
    expect(copy).toContain('2 days after your dose');
  });

  it('says so plainly when nothing has been logged', async () => {
    const tree = await render({ days: [] });

    expect(texts(tree).join(' ')).toContain('Nothing logged yet');
  });
});

describe('See all', () => {
  it('goes somewhere rather than expanding in place', async () => {
    const tree = await render();

    await act(async () => {
      one(tree, 'See your whole log').props.onPress();
    });

    expect(onSeeAll).toHaveBeenCalled();
  });

  it('is absent when there is nothing more than the card is showing', async () => {
    const tree = await render({ onSeeAll: undefined });

    expect(maybeOne(tree, 'See your whole log')).toBeUndefined();
  });

  it('is absent on the full screen — there is nowhere further to go', async () => {
    const tree = await render({ bare: true, onSeeAll: undefined });

    expect(maybeOne(tree, 'See your whole log')).toBeUndefined();
  });
});

describe('rows that open', () => {
  it('opens a dose, passing the id without its prefix', async () => {
    const tree = await render();

    await act(async () => {
      one(tree, 'Zepbound · 5 mg — see how this shot went').props.onPress();
    });

    expect(onOpenShot).toHaveBeenCalledWith('d1');
  });

  it('leaves every other row inert — there is nothing behind a single number', async () => {
    const tree = await render();
    const rows = tree.root.findAll((n) => String(n.type) === 'Pressable');
    const inert = rows.filter((r) => r.props.disabled === true);

    expect(inert.length).toBeGreaterThan(0);
    for (const row of inert) expect(row.props.accessibilityRole).toBeUndefined();
  });

  it('gives no two rows the same label', async () => {
    const tree = await render();

    expect(duplicateLabels(tree)).toEqual([]);
  });
});

describe('the screen variant', () => {
  it('drops the card chrome and its own title — the screen supplies both', async () => {
    const tree = await render({ bare: true, onSeeAll: undefined });

    expect(tree.root.findAll((n) => String(n.type) === 'Card')).toHaveLength(0);
    const header = tree.root
      .findAll((n) => String(n.type) === 'View')
      .find((n) => (n.props.style as { display?: string })?.display === 'none');
    expect(header).toBeTruthy();
  });

  it('renders exactly the same rows as the card', async () => {
    const card = await render();
    const screen = await render({ bare: true, onSeeAll: undefined });
    const rowsOf = (tree: TestRenderer.ReactTestRenderer) =>
      texts(tree).filter((t) => t !== 'Your log' && t !== 'See all');

    expect(rowsOf(screen)).toEqual(rowsOf(card));
  });
});
