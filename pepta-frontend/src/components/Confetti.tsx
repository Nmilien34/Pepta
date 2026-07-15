// Confetti — a ONE-SHOT celebratory burst for the reveal's payoff moment. Mount
// it (e.g. when the goal line reaches the flag) and each piece falls once with
// its own drift + spin, fading near the floor. Not a loop: a burst that plays
// and settles. Ported from Leanient's PlanReady celebration onto Pepta's palette.

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';

// Purple-led, per the v2.2 spec ("confetti burst, subtle, purple") with a few
// data-color accents for life.
const COLORS = ['#7C5CFC', '#E25CC4', '#2FA8FF', '#34C759', '#FF8A3D', '#7C5CFC'];

export interface ConfettiProps {
  count?: number;
}

export function Confetti({ count = 24 }: ConfettiProps) {
  const { width, height } = useWindowDimensions();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }, (_, i) => (
        <Confetto key={i} index={i} screenW={width} screenH={height} />
      ))}
    </View>
  );
}

function Confetto({ index, screenW, screenH }: { index: number; screenW: number; screenH: number }) {
  const fall = useRef(new Animated.Value(0)).current;
  const startX = useMemo(() => Math.random() * screenW, [screenW]);
  const drift = useMemo(() => (Math.random() - 0.5) * 100, []);
  const size = useMemo(() => 6 + Math.random() * 5, []);
  const round = useMemo(() => Math.random() > 0.6, []);
  const color = COLORS[index % COLORS.length];
  const spin = useMemo(() => `${Math.round((Math.random() - 0.5) * 720)}deg`, []);

  useEffect(() => {
    Animated.timing(fall, {
      toValue: 1,
      duration: 1700 + Math.random() * 900,
      delay: index * 26,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [fall, index]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -24,
        left: startX,
        width: size,
        height: round ? size : size * 1.6,
        borderRadius: round ? size : 2,
        backgroundColor: color,
        opacity: fall.interpolate({ inputRange: [0, 0.78, 1], outputRange: [1, 1, 0] }),
        transform: [
          { translateY: fall.interpolate({ inputRange: [0, 1], outputRange: [0, screenH + 40] }) },
          { translateX: fall.interpolate({ inputRange: [0, 1], outputRange: [0, drift] }) },
          { rotate: fall.interpolate({ inputRange: [0, 1], outputRange: ['0deg', spin] }) },
        ],
      }}
    />
  );
}
