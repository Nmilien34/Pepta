// OptionCard — a tappable onboarding choice (single- or multi-select). Pepta's
// selection style is restrained/neutral (near-black outline + dark filled check,
// NOT a purple/colored fill — per Nick's "purple is an accent" rule). The
// selected state cross-fades (border + surface + check) over 180ms, and the card
// gives a calm press-spring. Icon is passed in so each screen owns its glyph.

import React, { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import { AppText } from '../AppText';

export interface OptionCardProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  selected: boolean;
  onPress(): void;
  // 'radio' for single-select, 'checkbox' for multi-select (a11y + semantics).
  multi?: boolean;
}

export function OptionCard({ title, subtitle, icon, selected, onPress, multi = false }: OptionCardProps) {
  const theme = useTheme();
  const sel = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(sel, {
      toValue: selected ? 1 : 0,
      duration: 180,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: false, // animating colors
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
  const checkBg = sel.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0,0,0,0)', theme.colors.textPrimary],
  });
  const checkBorder = sel.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.border, theme.colors.textPrimary],
  });

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => press(theme.motion.scale.pressIn)}
        onPressOut={() => press(theme.motion.scale.pressOut)}
        accessibilityRole={multi ? 'checkbox' : 'radio'}
        accessibilityState={{ selected }}
        accessibilityLabel={title}
      >
        <Animated.View
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              padding: 15,
              borderRadius: 18,
              borderWidth: 2,
              borderColor,
              backgroundColor,
            },
            selected ? theme.shadows.soft : null,
          ]}
        >
          {icon ? <View style={{ width: 26, alignItems: 'center' }}>{icon}</View> : null}
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong" style={{ fontWeight: '700' }}>
              {title}
            </AppText>
            {subtitle ? (
              <AppText variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
                {subtitle}
              </AppText>
            ) : null}
          </View>
          <Animated.View
            style={{
              width: 24,
              height: 24,
              borderRadius: multi ? 7 : 12,
              borderWidth: 2,
              borderColor: checkBorder,
              backgroundColor: checkBg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Animated.View style={{ opacity: sel }}>
              <Ionicons name="checkmark" size={14} color={theme.colors.onPrimary} />
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}
