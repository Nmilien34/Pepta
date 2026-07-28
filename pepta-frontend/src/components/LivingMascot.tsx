// Pep, alive. Wraps <Mascot> in the small involuntary motion that separates a
// character from a sticker:
//
//   breathe — a continuous bob whose tempo comes from the mood. Fast near peak,
//             slow and shallow when drowsy, barely-there asleep.
//   blink   — a quick vertical squash on a randomised interval, so two Peps on
//             screen never blink in lockstep and it never looks like a loop.
//   react   — a spring pop when the pose changes, so a mood shift is felt.
//
// All native-driver transforms (Leanient's rule — no reanimated), and every
// timer is cleared on unmount. Blinking is skipped for the closed-eye poses,
// where it would read as a twitch.

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { Mascot, type MascotPose } from './Mascot';

export interface LivingMascotProps {
  pose?: MascotPose;
  size?: number;
  /** Seconds per bob cycle — pass buildPepMood().bobSeconds. */
  bobSeconds?: number;
  /** Turn off all motion (reduce-motion, or a still frame in a screenshot). */
  still?: boolean;
}

const CLOSED_EYES: ReadonlySet<MascotPose> = new Set<MascotPose>(['drowsy', 'asleep']);

export function LivingMascot({
  pose = 'idle',
  size = 140,
  bobSeconds = 3.5,
  still = false,
}: LivingMascotProps) {
  const bob = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const blinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Amplitude follows tempo: a sleepy Pep should drift, not bounce.
  const rise = useMemo(() => (pose === 'asleep' ? 3 : pose === 'drowsy' ? 4 : 7), [pose]);

  useEffect(() => {
    if (still) return;
    bob.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: bobSeconds * 500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: bobSeconds * 500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, bobSeconds, still]);

  useEffect(() => {
    if (still || CLOSED_EYES.has(pose)) return;

    // Randomised gap so multiple Peps never sync up into a metronome.
    const schedule = () => {
      const delay = 2600 + Math.random() * 3200;
      blinkTimer.current = setTimeout(() => {
        Animated.sequence([
          Animated.timing(blink, { toValue: 0.08, duration: 70, useNativeDriver: true }),
          Animated.timing(blink, { toValue: 1, duration: 90, useNativeDriver: true }),
        ]).start(({ finished }) => {
          if (finished) schedule();
        });
      }, delay);
    };
    schedule();

    return () => {
      if (blinkTimer.current) clearTimeout(blinkTimer.current);
      blinkTimer.current = null;
      blink.setValue(1);
    };
  }, [blink, pose, still]);

  // Pop on every pose change — the mood shift should be felt, not just seen.
  useEffect(() => {
    if (still) return;
    pop.setValue(0.86);
    Animated.spring(pop, {
      toValue: 1,
      friction: 5,
      tension: 140,
      useNativeDriver: true,
    }).start();
  }, [pose, pop, still]);

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -rise] });

  return (
    <Animated.View
      style={{ transform: [{ translateY }, { scale: pop }] }}
      // The mascot is decorative; its message is announced by the bubble.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* scaleY on an inner view so the blink squashes without moving the bob */}
      <Animated.View style={{ transform: [{ scaleY: blink }] }}>
        <View>
          <Mascot pose={pose} size={size} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}
