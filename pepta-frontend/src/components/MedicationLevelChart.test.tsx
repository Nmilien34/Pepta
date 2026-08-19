// The chart's own rendering. Geometry is tested in screens/app/levelChart.ts;
// what is asserted here is what the frame actually shows — a right-hand scale
// that carries its unit, a readout that is the level AT NOW, and a legend row
// of three.

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { MedicationLevelChart } from './MedicationLevelChart';

vi.mock('react-native', () => {
  const passthrough = (name: string) =>
    Object.assign(
      ({ children, ...props }: { children?: React.ReactNode }) =>
        React.createElement(name, props, children),
      { displayName: name },
    );
  return { View: passthrough('View'), Text: passthrough('Text') };
});

vi.mock('react-native-svg', () => {
  const p = (name: string) =>
    ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(name, props, children);
  return {
    default: p('Svg'),
    Svg: p('Svg'),
    Circle: p('Circle'),
    Line: p('Line'),
    Path: p('Path'),
    Text: p('SvgText'),
    TSpan: p('TSpan'),
  };
});

vi.mock('./AppText', () => ({
  AppText: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('AppText', null, children),
}));

vi.mock('../theme', () => ({
  useTheme: () => ({
    colors: {
      surface: '#fff',
      border: '#E8E8EE',
      primary: '#7C5CFC',
      textPrimary: '#000',
      textSecondary: '#666',
      textTertiary: '#A6A6B0',
    },
    spacing: { sm: 8, md: 12, lg: 16 },
  }),
}));

const NOW = new Date('2026-08-19T12:00:00.000Z');

/** Two days of decay either side of now, so the split has both halves. */
const curve = Array.from({ length: 9 }, (_, i) => ({
  datetime: new Date(NOW.getTime() + (i - 4) * 12 * 60 * 60 * 1000).toISOString(),
  level: 4 - i * 0.4,
}));

async function render(props: Partial<Parameters<typeof MedicationLevelChart>[0]> = {}) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <MedicationLevelChart curve={curve} unit="mg" now={NOW} {...props} />,
    );
  });
  // Width arrives by layout; without it there is no plot to draw.
  await act(async () => {
    tree.root
      .findAll((n) => String(n.type) === 'View')[0]!
      .props.onLayout({ nativeEvent: { layout: { width: 300 } } });
  });
  return tree;
}

const svgTexts = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAll((n) => String(n.type) === 'SvgText');

const flatten = (node: TestRenderer.ReactTestInstance): string => {
  const out: string[] = [];
  const walk = (n: TestRenderer.ReactTestInstance) => {
    for (const c of n.children) {
      if (typeof c === 'string') out.push(c);
      else walk(c);
    }
  };
  walk(node);
  return out.join('');
};

describe('the right-hand scale', () => {
  it('carries the unit on every line, including zero', async () => {
    const tree = await render();
    const labels = svgTexts(tree)
      .map(flatten)
      .filter((text) => text.includes('mg'));

    // Four gridlines plus the baseline.
    expect(labels).toHaveLength(5);
    expect(labels.at(-1)).toBe('0mg');
  });

  it('sets the unit smaller and fainter than the number', async () => {
    const tree = await render();
    const unit = tree.root.findAll((n) => String(n.type) === 'TSpan')[0]!;

    expect(unit.props.fontSize).toBe(7.5);
    expect(unit.props.fillOpacity).toBeLessThan(1);
  });

  it('says mcg when that is the compound\'s unit — not a hardcoded mg', async () => {
    const tree = await render({ unit: 'mcg' });
    const labels = svgTexts(tree).map(flatten);

    expect(labels.some((text) => text.endsWith('mcg'))).toBe(true);
    expect(labels.some((text) => text.endsWith('mg') && !text.endsWith('mcg'))).toBe(false);
  });
});

describe('the readout', () => {
  it('is the level at now, and says so', async () => {
    const tree = await render();
    const copy = flatten(tree.root);

    // Now sits at the middle sample: 4 - 4*0.4 = 2.4.
    expect(copy).toContain('2.4');
    expect(copy).toContain('Right now');
  });

  it('names the trough as the pre-next-dose figure when given one', async () => {
    const tree = await render({ troughBeforeNextDose: 0.9 });

    expect(flatten(tree.root)).toContain('Trough before your next dose');
  });

  it('leaves the trough line out entirely when there is none', async () => {
    const tree = await render();

    expect(flatten(tree.root)).not.toContain('Trough');
  });
});

describe('the legend', () => {
  it('separates measured from projected, and names the window peak', async () => {
    const tree = await render({ peak: 4 });
    const copy = flatten(tree.root);

    expect(copy).toContain('From your logs');
    expect(copy).toContain('Projected');
    expect(copy).toContain('Peak 4');
  });

  it('omits the peak rather than printing zero when there is none', async () => {
    const tree = await render();

    expect(flatten(tree.root)).not.toContain('Peak');
  });
});
