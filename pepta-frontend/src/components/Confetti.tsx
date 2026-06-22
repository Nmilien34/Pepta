// Confetti — a contained burst of falling, rotating pieces for the reveal. Each
// piece loops on its own timing (RN Animated, native driver). Fixed configs so
// it's deterministic. Sits in a normal-flow box at the top of the screen.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { useTheme } from '../theme';

interface Piece {
  left: number; // 0..1 fraction of width
  color: string;
  size: number;
  delay: number;
  duration: number;
  round?: boolean;
}

export interface ConfettiProps {
  height?: number;
}

export function Confetti({ height = 200 }: ConfettiProps) {
  const theme = useTheme();
  const c = theme.colors;
  const pieces: Piece[] = [
    { left: 0.08, color: c.protein, size: 7, delay: 0, duration: 2600 },
    { left: 0.2, color: c.fiber, size: 6, delay: 320, duration: 2900, round: true },
    { left: 0.34, color: c.water, size: 8, delay: 120, duration: 2500 },
    { left: 0.48, color: c.weight, size: 6, delay: 480, duration: 3000 },
    { left: 0.62, color: c.primary, size: 7, delay: 200, duration: 2700, round: true },
    { left: 0.76, color: c.protein, size: 6, delay: 560, duration: 2850 },
    { left: 0.88, color: c.primaryGradientEnd, size: 8, delay: 80, duration: 2600 },
  ];

  return (
    <View pointerEvents="none" style={{ height, overflow: 'hidden' }}>
      {pieces.map((p, i) => (
        <ConfettiPiece key={i} piece={p} height={height} />
      ))}
    </View>
  );
}

function ConfettiPiece({ piece, height }: { piece: Piece; height: number }) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: piece.duration,
        delay: piece.delay,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [t, piece.duration, piece.delay]);

  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [-20, height + 20] });
  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '320deg'] });
  const opacity = t.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: `${piece.left * 100}%`,
        width: piece.size,
        height: piece.round ? piece.size : piece.size * 1.6,
        borderRadius: piece.round ? piece.size : 2,
        backgroundColor: piece.color,
        opacity,
        transform: [{ translateY }, { rotate }],
      }}
    />
  );
}
