// Plays a rising haptic sweep alongside an animation. The schedule (when each
// tap fires and how hard) is computed by the pure `hapticRamp` util; this hook
// only owns the timers and the expo-haptics calls.
//
// Pass the same duration the animation uses so the last tap lands on its final
// frame, and `delayMs` if the animation starts after a lead-in delay.

import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { buildHapticRamp, type RampStyle } from '../utils/hapticRamp';

const IMPACT: Record<RampStyle, Haptics.ImpactFeedbackStyle> = {
  soft: Haptics.ImpactFeedbackStyle.Soft,
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  rigid: Haptics.ImpactFeedbackStyle.Rigid,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

export interface UseHapticRampOptions {
  durationMs: number;
  pulses: number;
  /** Lead-in before the first tap — match the animation's own delay. */
  delayMs?: number;
  acceleration?: number;
}

export function useHapticRamp(
  active: boolean,
  { durationMs, pulses, delayMs = 0, acceleration }: UseHapticRampOptions,
): void {
  useEffect(() => {
    if (!active || Platform.OS === 'web') return;

    const timers = buildHapticRamp({ durationMs, pulses, acceleration }).map(
      (pulse) =>
        setTimeout(() => {
          void Haptics.impactAsync(IMPACT[pulse.style]).catch(() => undefined);
        }, delayMs + pulse.atMs),
    );

    return () => timers.forEach(clearTimeout);
  }, [active, durationMs, pulses, delayMs, acceleration]);
}
