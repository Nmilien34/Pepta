// Onboarding header: a back affordance + the slim progress bar. The progress
// fill is a MODULE-LEVEL persistent Animated.Value (Leanient's trick) so it
// animates from its current position to the next step's value — forward grows,
// back shrinks — instead of resetting to 0 on every screen mount.

import React, { useEffect } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { Icon } from "../Icon";
import { useTheme } from '../../theme';

// Persists across screen mounts — intentionally module-level (single instance).
const progressFill = new Animated.Value(0);

export interface OnboardingHeaderProps {
  // 0..1 progress through onboarding.
  progress: number;
  onBack?(): void;
  showBack?: boolean;
}

export function OnboardingHeader({ progress, onBack, showBack = true }: OnboardingHeaderProps) {
  const theme = useTheme();

  useEffect(() => {
    const animation = Animated.timing(progressFill, {
      toValue: Math.max(0, Math.min(1, progress)),
      duration: 500,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: false, // animating width
    });
    animation.start();
    return () => animation.stop();
  }, [progress]);

  const width = progressFill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.xl,
        paddingTop: theme.spacing.sm,
        paddingBottom: theme.spacing.md,
      }}
    >
      {showBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={theme.sizes.hitSlop}
          style={{
            width: 38,
            height: 38,
            borderRadius: theme.radii.pill,
            backgroundColor: theme.colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="chevron-back" size={22} color={theme.colors.textSecondary} />
        </Pressable>
      ) : (
        <View style={{ width: 38, height: 38 }} />
      )}
      <View
        style={{
          flex: 1,
          height: 6,
          borderRadius: theme.radii.pill,
          backgroundColor: theme.colors.surfaceAlt,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={{ width, height: '100%', borderRadius: theme.radii.pill, backgroundColor: theme.colors.textPrimary }}
        />
      </View>
    </View>
  );
}
