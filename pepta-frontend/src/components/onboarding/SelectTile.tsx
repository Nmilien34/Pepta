// SelectTile — a compact, vertical selectable card for 2-column grids (frequency,
// sex/gender, biggest worry). Same neutral selection language as OptionCard/Chip
// (border + surface cross-fade, press-spring). Fills its parent cell.

import React, { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable } from 'react-native';
import { useTheme } from '../../theme';
import { AppText } from '../AppText';

export interface SelectTileProps {
  label: string;
  icon?: ReactNode;
  selected: boolean;
  onPress(): void;
  align?: 'start' | 'center';
}

export function SelectTile({ label, icon, selected, onPress, align = 'start' }: SelectTileProps) {
  const theme = useTheme();
  const sel = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(sel, {
      toValue: selected ? 1 : 0,
      duration: 180,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: false,
    }).start();
  }, [sel, selected]);

  const press = (toValue: number) =>
    Animated.spring(scale, { toValue, useNativeDriver: true, ...theme.motion.springs.press }).start();

  const borderColor = sel.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0,0,0,0)', theme.colors.textPrimary],
  });
  const backgroundColor = sel.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.surfaceAlt, theme.colors.surface],
  });

  return (
    <Animated.View style={{ transform: [{ scale }], width: '100%' }}>
      <Pressable onPress={onPress} onPressIn={() => press(theme.motion.scale.pressIn)} onPressOut={() => press(theme.motion.scale.pressOut)} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={label}>
        <Animated.View
          style={[
            {
              gap: theme.spacing.sm,
              padding: 14,
              borderRadius: 16,
              borderWidth: 2,
              borderColor,
              backgroundColor,
              alignItems: align === 'center' ? 'center' : 'flex-start',
            },
            selected ? theme.shadows.soft : null,
          ]}
        >
          {icon}
          <AppText variant="bodyStrong" align={align === 'center' ? 'center' : undefined} style={{ fontWeight: '700' }}>
            {label}
          </AppText>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}
