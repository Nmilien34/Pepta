// DayOfWeekPicker — a row of seven selectable day cells (Sun..Sat → 0..6). Same
// neutral selection language as the other onboarding controls. Full day names
// are used for accessibility since the letters repeat (S, T).

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { AppText } from '../AppText';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface DayOfWeekPickerProps {
  // Selected day indices (0 = Sunday … 6 = Saturday). Multi-select.
  value: number[];
  onToggle(day: number): void;
}

export function DayOfWeekPicker({ value, onToggle }: DayOfWeekPickerProps) {
  return (
    <View style={{ flexDirection: 'row', gap: 7 }}>
      {DAY_LETTERS.map((letter, index) => (
        <DayCell
          key={index}
          letter={letter}
          name={DAY_NAMES[index] ?? letter}
          selected={value.includes(index)}
          onPress={() => {
            if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onToggle(index);
          }}
        />
      ))}
    </View>
  );
}

interface DayCellProps {
  letter: string;
  name: string;
  selected: boolean;
  onPress(): void;
}

function DayCell({ letter, name, selected, onPress }: DayCellProps) {
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
    <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => press(theme.motion.scale.pressIn)}
        onPressOut={() => press(theme.motion.scale.pressOut)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={name}
      >
        <Animated.View
          style={[
            {
              height: 46,
              borderRadius: 13,
              borderWidth: 2,
              borderColor,
              backgroundColor,
              alignItems: 'center',
              justifyContent: 'center',
            },
            selected ? theme.shadows.soft : null,
          ]}
        >
          <AppText variant="bodyStrong" style={{ fontWeight: '700' }}>
            {letter}
          </AppText>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}
