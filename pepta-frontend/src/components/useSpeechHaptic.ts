// The companion's "voice" in haptics: a soft double-tap that fires whenever a
// new line from Pep appears. It is deliberately its OWN feel, distinct from
// every other haptic in the app —
//
//   selectionAsync         = the user did something (taps, toggles, wheels)
//   notificationAsync      = a task finished (save, error)
//   Soft → Soft (this)     = the companion said something
//
// Two light taps rather than one, because a single Soft is easy to mistake for
// a stray selection tick. Fires on the CONTENT changing, not on visibility, so
// stepping through several notes speaks once per line.

import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/** Gap between the two beats. Short enough to read as one gesture. */
const SECOND_BEAT_MS = 110;

export function useSpeechHaptic(
  /** The line currently being said; undefined/null when silent. */
  line: string | null | undefined,
  /** False to stay quiet (bubble closed, reduce-motion, screenshot mode). */
  active = true,
): void {
  const spoken = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active || !line) {
      // Reset so re-opening on the SAME line speaks again — reopening is a
      // new utterance from the user's point of view.
      spoken.current = null;
      return;
    }
    if (spoken.current === line) return;
    spoken.current = line;

    if (Platform.OS === 'web') return;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => undefined);
    timer.current = setTimeout(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => undefined);
    }, SECOND_BEAT_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [line, active]);
}
