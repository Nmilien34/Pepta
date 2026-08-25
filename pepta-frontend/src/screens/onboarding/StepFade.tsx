// Fade-through between onboarding turns: the leaving turn dips out, the next
// eases in and settles up a few points — one soft blink instead of a hard cut,
// in both directions.
//
// SLOWED AND GIVEN A RISE on 2026-08-24 (Nick, via design-lab/onboarding-pace).
// This was 90ms out / 160ms in, and 90ms is below the threshold where the eye
// reads a dissolve at all — so every turn snapped away rather than settling,
// which was half of why the flow felt like a quiz. It is now ~1.0s end to end.
//
// The rise REVERSES this file's previous rule. "Deliberately restrained (no
// slide, no scale)" was right at a 250ms swap, where movement would only have
// added noise. At 1.0s a pure opacity fade reads as the app hesitating; a few
// points of drift is what makes the same duration read as intentional.
//
// Mechanics: while the fade-out plays, the OLD turn stays mounted (held from
// the last render at its key) with input blocked; the new turn mounts only
// after the dip, so autofocus/effects fire once, at the right time. State
// truth (step, draft persistence) advances instantly — only visuals lag.

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing } from 'react-native';

import { pace } from '../../components/onboarding/convoPace';

export const STEP_FADE_OUT_MS = pace.stepFadeOutMs;
export const STEP_FADE_IN_MS = pace.stepFadeInMs;
export const STEP_RISE_PT = pace.stepRisePt;

export function StepFade({ stepKey, children }: { stepKey: string; children: ReactNode }) {
  const opacity = useRef(new Animated.Value(1)).current;
  // 0 = settled. Driven only on the way IN; the outgoing turn just dips, so it
  // never appears to slide away from the user.
  const rise = useRef(new Animated.Value(0)).current;
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
      rise.setValue(STEP_RISE_PT);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: STEP_FADE_IN_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(rise, {
          toValue: 0,
          duration: STEP_FADE_IN_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [stepKey, displayed, opacity, rise]);

  return (
    <Animated.View
      style={{ flex: 1, opacity, transform: [{ translateY: rise }] }}
      // The outgoing turn should not take taps mid-dissolve.
      pointerEvents={displayed === stepKey ? 'auto' : 'none'}
    >
      {displayed === stepKey ? children : held.current}
    </Animated.View>
  );
}
