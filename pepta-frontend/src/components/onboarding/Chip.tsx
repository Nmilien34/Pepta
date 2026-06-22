// Chip — a selectable pill for compact multi/single-select grids (dose, shot day,
// side effects, focus). Same restrained neutral selection language as OptionCard
// (border + surface cross-fade, dark check, press-spring) — never a purple fill.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import { AppText } from '../AppText';

export interface ChipProps {
  label: string;
  selected: boolean;
  onPress(): void;
  multi?: boolean;
}

export function Chip({ label, selected, onPress, multi = false }: ChipProps) {
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
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => press(theme.motion.scale.pressIn)}
        onPressOut={() => press(theme.motion.scale.pressOut)}
        accessibilityRole={multi ? 'checkbox' : 'radio'}
        accessibilityState={{ selected }}
        accessibilityLabel={label}
      >
        <Animated.View
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.xs,
              paddingVertical: 10,
              paddingHorizontal: 15,
              borderRadius: theme.radii.pill,
              borderWidth: 2,
              borderColor,
              backgroundColor,
            },
            selected ? theme.shadows.soft : null,
          ]}
        >
          <AppText variant="bodyStrong" style={{ fontWeight: '600' }}>
            {label}
          </AppText>
          {selected ? <Ionicons name="checkmark" size={14} color={theme.colors.textPrimary} /> : null}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}
