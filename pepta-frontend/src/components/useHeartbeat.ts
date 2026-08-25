// Plays the heartbeat schedule while a hold is in progress.
//
// Same split as useHapticRamp: `buildHeartbeat` owns the timing and unit-tests
// in plain Node; this hook owns only the timers and the expo-haptics calls.
//
// It is keyed on `active` going true, so releasing early tears every pending
// tap down — a hold that was abandoned must go silent immediately, or the
// phone keeps thumping at a finger that is no longer there.

import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { buildHeartbeat, type HeartbeatStyle } from '../utils/heartbeat';

const IMPACT: Record<HeartbeatStyle, Haptics.ImpactFeedbackStyle> = {
  soft: Haptics.ImpactFeedbackStyle.Soft,
  medium: Haptics.ImpactFeedbackStyle.Medium,
};

export function useHeartbeat(active: boolean, durationMs: number): void {
  useEffect(() => {
    if (!active || Platform.OS === 'web') return;

    const timers = buildHeartbeat({ durationMs }).map((tap) =>
      setTimeout(() => {
        void Haptics.impactAsync(IMPACT[tap.style]).catch(() => undefined);
      }, tap.atMs),
    );

    return () => timers.forEach(clearTimeout);
  }, [active, durationMs]);
}
