// SegmentedToggle — a compact 2+ option pill toggle (Imperial/Metric, lb/kg).
// Selected segment lifts onto a white surface; centered by the parent.
// `compact` is the design-hub segctl scale (12px, tighter padding) used where
// three options must fit inside a card (Mix calculator syringe, Cycle repeat).

import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../theme';
import { AppText } from '../AppText';

export interface SegmentedToggleProps<T extends string | number> {
  options: ReadonlyArray<{ label: string; value: T }>;
  value: T;
  onChange(value: T): void;
  compact?: boolean;
}

export function SegmentedToggle<T extends string | number>({
  options,
  value,
  onChange,
  compact,
}: SegmentedToggleProps<T>) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignSelf: 'center',
        backgroundColor: theme.colors.surfaceAlt,
        borderRadius: theme.radii.pill,
        padding: 3,
        ...(compact ? { gap: 2 } : {}),
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              compact
                ? { paddingVertical: 5, paddingHorizontal: 11, borderRadius: theme.radii.pill }
                : { paddingVertical: 7, paddingHorizontal: 16, borderRadius: theme.radii.pill },
              selected ? { backgroundColor: theme.colors.surface } : null,
              selected ? theme.shadows.soft : null,
            ]}
          >
            <AppText
              variant={compact ? 'caption' : 'bodyStrong'}
              color={selected ? 'textPrimary' : 'textSecondary'}
              style={{ fontWeight: '700', ...(compact ? { fontSize: 12 } : {}) }}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
