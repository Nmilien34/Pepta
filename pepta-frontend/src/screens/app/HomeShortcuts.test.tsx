// The grid's contract: every tile is pressable, and an odd count does not
// stretch the last one across the row.

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

vi.mock('react-native', () => {
  const passthrough = (name: string) =>
    Object.assign(
      ({ children, ...props }: { children?: React.ReactNode }) =>
        React.createElement(name, props, children),
      { displayName: name },
    );
  return {
    Image: passthrough('Image'),
    Pressable: passthrough('Pressable'),
    Text: passthrough('Text'),
    View: passthrough('View'),
    StyleSheet: { create: (s: unknown) => s, absoluteFill: {}, hairlineWidth: 1 },
    Platform: { OS: 'ios' },
  };
});

vi.mock('../../components', () => ({
  AppText: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('Text', null, children),
  Card: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('View', null, children),
}));

vi.mock('../../theme', () => ({
  useTheme: () => ({ colors: { surface: '#fff' }, radii: { pill: 999 } }),
}));

import { HomeShortcuts, type Shortcut } from './HomeShortcuts';

const shortcut = (key: string, onPress = vi.fn()): Shortcut => ({
  key,
  label: key,
  photo: 1 as never,
  onPress,
});

// The RN mock renders host elements named after the component, so node.type is
// the string — which the react-test-renderer types do not narrow to.
function byName(tree: TestRenderer.ReactTestRenderer, name: string) {
  return tree.root.findAll((n) => (n.type as unknown as string) === name);
}

function pressables(tree: TestRenderer.ReactTestRenderer) {
  return byName(tree, 'Pressable');
}

describe('HomeShortcuts', () => {
  it('renders one pressable per shortcut', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <HomeShortcuts shortcuts={[shortcut('meals'), shortcut('fiber'), shortcut('hydration')]} />,
      );
    });
    expect(pressables(tree)).toHaveLength(3);
  });

  it('fires the tile it was given, not another one', () => {
    const meals = vi.fn();
    const fiber = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <HomeShortcuts shortcuts={[shortcut('meals', meals), shortcut('fiber', fiber)]} />,
      );
    });
    act(() => {
      pressables(tree)[1]?.props.onPress();
    });
    expect(fiber).toHaveBeenCalledTimes(1);
    expect(meals).not.toHaveBeenCalled();
  });

  it('pads an odd row instead of stretching the last tile', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <HomeShortcuts shortcuts={[shortcut('a'), shortcut('b'), shortcut('c')]} />,
      );
    });
    // Three tiles => two rows, and the second carries a spacer alongside its
    // single tile so it stays half-width.
    expect(pressables(tree)).toHaveLength(3);
    const spacers = byName(tree, 'View').filter(
      (n) => !n.props.children && n.props.style?.flex === 1,
    );
    expect(spacers).toHaveLength(1);
  });

  it('renders nothing rather than an empty row when there are no shortcuts', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<HomeShortcuts shortcuts={[]} />);
    });
    expect(pressables(tree)).toHaveLength(0);
  });
});
