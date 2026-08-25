// Hold-to-commit — a ring that closes while the finger stays down.
//
// WHY A HOLD AND NOT A TAP. Every other yes in this flow is a tap, and taps
// are cheap by design (the micro-commitment ladder). This one should not be:
// effort is what turns an assent into a commitment, and a second of deliberate
// pressure is the smallest honest amount of it. The heartbeat under the finger
// is the point — see utils/heartbeat.ts for why it is a pulse and not a ramp.
//
// RELEASING EARLY CANCELS, VISIBLY AND SILENTLY. The ring springs back and the
// haptics stop on the same frame. A control that completed anyway, or kept
// thumping at a finger that had gone, would make the promise feel extracted
// rather than given.

import React, { useCallback, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import { typography } from '../theme/typography';
import { convo } from './onboarding/convoTokens';
import { HOLD_MS } from '../utils/heartbeat';
import { useHeartbeat } from './useHeartbeat';

const SIZE = 96;
const STROKE = 5;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface HoldToCommitProps {
  label: string;
  /** Fires once, when the ring closes. Never on an early release. */
  onComplete(): void;
  /** Overridable for tests; defaults to the tuned hold. */
  durationMs?: number;
}

export function HoldToCommit({ label, onComplete, durationMs = HOLD_MS }: HoldToCommitProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const [holding, setHolding] = useState(false);
  // Latched so a second press after completion cannot fire onComplete twice.
  const done = useRef(false);

  useHeartbeat(holding, durationMs);

  const start = useCallback(() => {
    if (done.current) return;
    setHolding(true);
    Animated.timing(progress, {
      toValue: 1,
      duration: durationMs,
      easing: Easing.linear,
      // The ring is an SVG stroke, not a transform — it cannot go native.
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished || done.current) return;
      done.current = true;
      setHolding(false);
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => undefined,
        );
      }
      onComplete();
    });
  }, [durationMs, onComplete, progress]);

  const cancel = useCallback(() => {
    if (done.current) return;
    setHolding(false);
    progress.stopAnimation(() => {
      Animated.timing(progress, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
    });
  }, [progress]);

  const dashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCUMFERENCE, 0],
  });

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        // Announced because the interaction is not discoverable: a screen
        // reader user has no way to know a tap will not do.
        accessibilityHint="Press and hold to sign it"
        onPressIn={start}
        onPressOut={cancel}
        onAccessibilityTap={() => {
          // VoiceOver cannot express a sustained press, so the gesture would be
          // unreachable. The tap stands in for it rather than being blocked.
          if (done.current) return;
          done.current = true;
          AccessibilityInfo.announceForAccessibility?.('Signed');
          onComplete();
        }}
        style={styles.press}
      >
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={convo.hairline}
            strokeWidth={STROKE}
            fill="none"
          />
          <AnimatedCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={convo.primary}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashoffset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </Svg>
        <View style={styles.dot} pointerEvents="none" />
      </Pressable>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 11 },
  press: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  dot: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: convo.primary,
  },
  label: {
    fontFamily: typography.fonts.semiBold,
    fontSize: 13,
    color: convo.dim,
  },
});
