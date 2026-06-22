// Reveal — fades + rises its children on mount. Used to stagger onboarding
// content in (mascot → title → subtitle → CTA). Uses the RN Animated API with
// the native driver, matching Leanient's motion approach. Gentle by default.

import React, { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';

export interface RevealProps {
  children: ReactNode;
  delay?: number;
  distance?: number;
  duration?: number;
  style?: ViewStyle;
}

export function Reveal({ children, delay = 0, distance = 14, duration = 600, style }: RevealProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, delay, duration]);

  return (
    <Animated.View
      style={[
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}
