// Float — a continuous, gentle vertical bob. Wraps the mascot on hero screens so
// Pep feels alive without being distracting (Leanient floats its hero ~8px over
// ~4.5s). RN Animated, native driver.

import React, { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';

export interface FloatProps {
  children: ReactNode;
  amplitude?: number;
  duration?: number;
  style?: ViewStyle;
}

export function Float({ children, amplitude = 8, duration = 2250, style }: FloatProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, duration]);

  return (
    <Animated.View
      style={[
        {
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -amplitude] }) },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}
