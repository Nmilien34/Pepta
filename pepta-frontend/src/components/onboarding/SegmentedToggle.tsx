// SegmentedToggle — a compact 2+ option pill toggle (Imperial/Metric, lb/kg).
// Selected segment lifts onto a white surface; centered by the parent.

import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../theme';
import { AppText } from '../AppText';

export interface SegmentedToggleProps<T extends string | number> {
  options: ReadonlyArray<{ label: string; value: T }>;
  value: T;
  onChange(value: T): void;
}

export function SegmentedToggle<T extends string | number>({
  options,
  value,
  onChange,
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
              { paddingVertical: 7, paddingHorizontal: 16, borderRadius: theme.radii.pill },
              selected ? { backgroundColor: theme.colors.surface } : null,
              selected ? theme.shadows.soft : null,
            ]}
          >
            <AppText
              variant="bodyStrong"
              color={selected ? 'textPrimary' : 'textSecondary'}
              style={{ fontWeight: '700' }}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
