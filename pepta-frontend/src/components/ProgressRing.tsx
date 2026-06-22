// ProgressRing — an SVG ring that fills on mount / when its percentage changes.
// Center content (number, label) is passed as children.

import React, { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ProgressRingProps {
  size: number;
  pct: number; // 0..1
  color: string;
  trackColor?: string;
  strokeWidth?: number;
  children?: ReactNode;
}

export function ProgressRing({ size, pct, color, trackColor = '#EFEFF2', strokeWidth = 9, children }: ProgressRingProps) {
  const anim = useRef(new Animated.Value(0)).current;
  const r = 50 - strokeWidth / 2;
  const circumference = 2 * Math.PI * r;

  useEffect(() => {
    const animation = Animated.timing(anim, {
      toValue: Math.max(0, Math.min(1, pct)),
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [anim, pct]);

  const offset = anim.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute' }}>
        <Circle cx={50} cy={50} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <AnimatedCircle
          cx={50}
          cy={50}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
        />
      </Svg>
      {children}
    </View>
  );
}
