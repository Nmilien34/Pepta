// Subtle fade-through between onboarding turns: the leaving turn dips out
// fast, the next one eases in — one soft blink instead of a hard cut, in both
// directions. Deliberately restrained (no slide, no scale): the turns already
// animate their own content, so the container only softens the swap.
//
// Mechanics: while the fade-out plays, the OLD turn stays mounted (held from
// the last render at its key) with input blocked; the new turn mounts only
// after the dip, so autofocus/effects fire once, at the right time. State
// truth (step, draft persistence) advances instantly — only visuals lag.

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing } from 'react-native';

export const STEP_FADE_OUT_MS = 90;
export const STEP_FADE_IN_MS = 160;

export function StepFade({ stepKey, children }: { stepKey: string; children: ReactNode }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [displayed, setDisplayed] = useState(stepKey);
  const held = useRef<ReactNode>(children);
  const latestKey = useRef(stepKey);
  latestKey.current = stepKey;
  // While the shown turn is current, keep holding its freshest render so
  // controlled inputs (toggles, steppers) update live.
  if (displayed === stepKey) held.current = children;

  useEffect(() => {
    if (displayed === stepKey) return;
    const fadeOut = Animated.timing(opacity, {
      toValue: 0,
      duration: STEP_FADE_OUT_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    });
    fadeOut.start(({ finished }) => {
      // A newer step change interrupted this fade — its own run finishes the job.
      if (!finished) return;
      setDisplayed(latestKey.current);
      Animated.timing(opacity, {
        toValue: 1,
        duration: STEP_FADE_IN_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
  }, [stepKey, displayed, opacity]);

  return (
    <Animated.View
      style={{ flex: 1, opacity }}
      // The outgoing turn should not take taps mid-dissolve.
      pointerEvents={displayed === stepKey ? 'auto' : 'none'}
    >
      {displayed === stepKey ? children : held.current}
    </Animated.View>
  );
}
