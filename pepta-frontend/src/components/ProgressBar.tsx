// ProgressBar — a track + fill that animates its width on mount and whenever the
// percentage changes (Easing.bezier, non-native since width interpolates).

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, type ColorValue } from 'react-native';
import { useTheme } from '../theme';

export interface ProgressBarProps {
  pct: number; // 0..1
  color: ColorValue;
  trackColor?: ColorValue;
  height?: number;
  delay?: number;
}

export function ProgressBar({ pct, color, trackColor, height = 8, delay = 0 }: ProgressBarProps) {
  const theme = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  const target = Math.max(0, Math.min(1, pct));

  useEffect(() => {
    const animation = Animated.timing(anim, {
      toValue: target,
      duration: 750,
      delay,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [target, delay, anim]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: trackColor ?? theme.colors.surfaceAlt, overflow: 'hidden' }}>
      <Animated.View style={{ width, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}
