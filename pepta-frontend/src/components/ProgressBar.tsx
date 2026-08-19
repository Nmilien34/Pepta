// ProgressBar — a track + fill that animates its width on mount and whenever the
// percentage changes (Easing.bezier, non-native since width interpolates).

import React from 'react';
import { Animated, View, type ColorValue } from 'react-native';
import { useSettleValue } from './entranceMotion';
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
  // Same rule as the rings: part-way in, then settle. A bar that refills from
  // zero every time you come back to the screen is a lie for a beat and a
  // wait for the rest of it.
  const anim = useSettleValue(pct, { delay });

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: trackColor ?? theme.colors.surfaceAlt, overflow: 'hidden' }}>
      <Animated.View style={{ width, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}
