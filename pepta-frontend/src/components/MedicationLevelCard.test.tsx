// The range control, rendered.
//
// The version that shipped was a View with no onPress, `i === 0` hardcoded so
// "7d" was always lit, above a curve the backend only ever drew +/-7 days. No
// test rendered it, so nothing said so. These press every option and assert on
// what the chart is handed.

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MedicationLevelCard } from './MedicationLevelCard';
import { duplicateLabels, one } from '../tests/byLabel';

vi.mock('react-native', () => {
  const passthrough = (name: string) =>
    Object.assign(
      ({ children, ...props }: { children?: React.ReactNode }) =>
        React.createElement(name, props, children),
      { displayName: name },
    );
  return {
    ActivityIndicator: passthrough('ActivityIndicator'),
    Pressable: passthrough('Pressable'),
    View: passthrough('View'),
    Text: passthrough('Text'),
    StyleSheet: { create: (s: unknown) => s },
    Platform: { OS: 'ios' },
  };
});

vi.mock('expo-haptics', () => ({ selectionAsync: vi.fn(() => Promise.resolve()) }));

vi.mock('./AppText', () => ({
  AppText: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('AppText', null, children),
}));
vi.mock('./Icon', () => ({ Icon: (p: { name: string }) => React.createElement('Icon', p) }));
vi.mock('./MedicationLevelChart', () => ({
  MedicationLevelChart: (p: unknown) => React.createElement('Chart', p as object),
}));
vi.mock('../theme', () => ({
  useTheme: () => ({
    colors: {
      surface: '#fff',
      surfaceAlt: '#eee',
      border: '#eee',
      primary: '#7C5CFC',
      textPrimary: '#000',
      textSecondary: '#666',
      textTertiary: '#999',
    },
    radii: { card: 20, pill: 999 },
    spacing: { sm: 8, md: 12, lg: 16, xl: 20 },
  }),
}));

const point = (day: number, level: number) => ({
  datetime: `2026-08-${String(day).padStart(2, '0')}T00:00:00.000Z`,
  level,
});

const ml = {
  compoundId: 'c1',
  curve: [point(12, 1), point(13, 0.9), point(14, 0.8)],
  peakEstimate: 1,
  currentEstimate: 0.8,
  troughEstimate: 0.2,
};

const wide = {
  range: 'quarter' as const,
  daysBefore: 90,
  daysAfter: 14,
  // Always present on the wire: the schema defaults it to [].
  doses: [{ compoundId: 'c1', datetime: point(2, 0).datetime }],
  levels: [
    {
      compoundId: 'c1',
      compoundName: 'Tirzepatide',
      halfLifeDays: 5,
      currentEstimate: 0.8,
      peakEstimate: 4.2,
      troughEstimate: 0.1,
      curve: [point(1, 4.2), point(2, 3), point(3, 2)],
      nextDoseAt: null,
      hoursUntilNextDose: null,
      estimateBasis: 'relative-dose-equivalent' as const,
      engineVersion: 'pk-v2',
    },
  ],
};

const setRange = vi.fn();
const retry = vi.fn();

function rangeState(over: Partial<ReturnType<typeof baseRange>> = {}) {
  return { ...baseRange(), ...over };
}
function baseRange() {
  return {
    range: 'week' as 'week' | 'month' | 'quarter' | 'all',
    setRange,
    fetched: {} as Record<string, typeof wide>,
    loading: false,
    failed: null as string | null,
    retry,
  };
}

async function render(range: ReturnType<typeof baseRange>, level: typeof ml | null = ml) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <MedicationLevelCard
        ml={level as never}
        range={range as never}
        compoundName="Tirzepatide"
        doseTimes={[{ datetime: point(13, 0).datetime }]}
        levelUnit="mg"
        doseWord="shot"
        suppressed={null}
        onLogDose={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );
  });
  return tree;
}

const chart = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAll((n) => String(n.type) === 'Chart')[0];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the range control', () => {
  it('offers all four windows, each one pressable', async () => {
    const tree = await render(rangeState());

    for (const label of ['Show week', 'Show month', 'Show 90d', 'Show all']) {
      const control = one(tree, label);
      expect(typeof control.props.onPress).toBe('function');
    }
  });

  it('asks for the window that was pressed — not a hardcoded first option', async () => {
    const tree = await render(rangeState());

    await act(async () => {
      one(tree, 'Show 90d').props.onPress();
    });

    expect(setRange).toHaveBeenCalledWith('quarter');
  });

  it('lights the selected one, and only that one', async () => {
    const tree = await render(rangeState({ range: 'quarter' }));

    expect(one(tree, 'Show 90d').props.accessibilityState).toEqual({ selected: true });
    expect(one(tree, 'Show week').props.accessibilityState).toEqual({ selected: false });
  });

  it('hands the chart the week curve /home already loaded', async () => {
    const tree = await render(rangeState());

    expect(chart(tree)!.props.curve).toEqual(ml.curve);
    expect(chart(tree)!.props.peak).toBe(1);
  });

  it('hands it the wider curve once that window lands', async () => {
    const tree = await render(rangeState({ range: 'quarter', fetched: { quarter: wide } }));

    expect(chart(tree)!.props.curve).toHaveLength(3);
    expect(chart(tree)!.props.peak).toBe(4.2);
  });

  it('draws NO chart while a wider window is still loading', async () => {
    // Rather than the week curve under a control reading 90d.
    const tree = await render(rangeState({ range: 'quarter', loading: true }));

    expect(chart(tree)).toBeUndefined();
    expect(tree.root.findAll((n) => String(n.type) === 'ActivityIndicator')).toHaveLength(1);
  });

  it('offers a retry instead of spinning when the window fails', async () => {
    const tree = await render(rangeState({ range: 'all', failed: 'all' }));

    expect(tree.root.findAll((n) => String(n.type) === 'ActivityIndicator')).toHaveLength(0);
    await act(async () => {
      one(tree, 'Try that window again').props.onPress();
    });
    expect(retry).toHaveBeenCalled();
  });

  it('keeps the control reachable even while its window is empty', async () => {
    const tree = await render(rangeState({ range: 'all', loading: true }));

    expect(one(tree, 'Show week')).toBeTruthy();
    expect(duplicateLabels(tree)).toEqual([]);
  });

  it('shows no control at all when there is no curve to window', async () => {
    const tree = await render(rangeState(), null);

    expect(tree.root.findAll((n) => String(n.type) === 'Chart')).toHaveLength(0);
    expect(
      tree.root.findAll(
        (n) => String(n.type) === 'Pressable' && n.props.accessibilityRole === 'tab',
      ),
    ).toHaveLength(0);
  });
});

describe('the markers under a wide window', () => {
  it('marks the doses that window carries, not /track\'s 30-day list', async () => {
    const tree = await render(rangeState({ range: 'quarter', fetched: { quarter: wide } }));

    expect(chart(tree)!.props.doses).toEqual([
      { compoundId: 'c1', datetime: point(2, 0).datetime },
    ]);
  });
});
