// Entrance motion for the gauges and charts.
//
// TWO PROBLEMS WITH WHAT WAS HERE. Rings and bars animated from ZERO on every
// mount, so every time you tabbed back to Home your protein swept up from
// nothing — which is both a lie for a beat (you have not just logged it) and
// tiring on the fifth visit of the day. And a full sweep from zero is a long
// way to travel: at 700ms it is the slowest thing on the screen.
//
// So: the value starts PART OF THE WAY THERE and settles the rest. It reads as
// alive without pretending to be counting up from nothing, and it is short
// enough not to be waited on.
//
// ONCE PER LAUNCH. Module state is per app launch, which is exactly the right
// scope — the first time you see a screen this session it settles, and every
// return after that paints the number immediately. Navigating is not an event
// worth animating.

import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * Where a gauge starts, as a fraction of its own target. 0.65 is far enough to
 * read as "already true" and near enough that the settle is a movement rather
 * than a fill.
 */
export const ENTRANCE_START = 0.65;

export const ENTRANCE_DURATION = 520;

/** Per launch, not per mount. Reset only by relaunching the app. */
let played = false;

/** True the first time it is asked this launch, false forever after. */
export function claimEntrance(): boolean {
  if (played) return false;
  played = true;
  return true;
}

export function hasPlayedEntrance(): boolean {
  return played;
}

/** Tests need a clean slate between cases; nothing in the app calls this. */
export function resetEntranceForTests(): void {
  played = false;
}

export interface SettleOptions {
  /** Staggering, so a column of gauges arrives in order rather than at once. */
  delay?: number;
  duration?: number;
}

/**
 * An Animated value that settles to `target`.
 *
 * On the first gauge of the launch it starts at ENTRANCE_START of the target
 * and animates in; after that it jumps straight there. A LATER CHANGE TO THE
 * TARGET always animates, whenever it happens — logging protein should move
 * the ring, and that is a different event from arriving on the screen.
 */
export function useSettleValue(target: number, options: SettleOptions = {}): Animated.Value {
  const safe = Number.isFinite(target) ? Math.max(0, Math.min(1, target)) : 0;
  // Claimed during the first render of the first gauge, so every gauge on that
  // first screen shares the same answer rather than the first one taking it.
  const entrance = useRef<boolean | null>(null);
  if (entrance.current === null) entrance.current = claimEntranceShared();

  const value = useRef(new Animated.Value(entrance.current ? safe * ENTRANCE_START : safe)).current;
  const previous = useRef(safe);

  useEffect(() => {
    const changed = previous.current !== safe;
    previous.current = safe;
    // Nothing to do on a remount that is neither the entrance nor a change.
    if (!entrance.current && !changed) {
      value.setValue(safe);
      return;
    }
    const animation = Animated.timing(value, {
      toValue: safe,
      duration: options.duration ?? ENTRANCE_DURATION,
      delay: entrance.current ? options.delay ?? 0 : 0,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    entrance.current = false;
    return () => animation.stop();
  }, [safe, value, options.delay, options.duration]);

  return value;
}

/**
 * The entrance is claimed once per launch and then SHARED for a short window,
 * so a screen full of gauges all animate rather than only whichever rendered
 * first. After the window it is spent, and later screens paint instantly.
 */
const SHARE_WINDOW_MS = 1200;
let sharedUntil = 0;

function claimEntranceShared(): boolean {
  const now = Date.now();
  if (now < sharedUntil) return true;
  if (claimEntrance()) {
    sharedUntil = now + SHARE_WINDOW_MS;
    return true;
  }
  return false;
}

/** Tests: also clear the shared window. */
export function resetEntranceWindowForTests(): void {
  played = false;
  sharedUntil = 0;
}


/**
 * The charts' version: they grow from the baseline UP rather than filling from
 * zero, so the shape is recognisable the whole way through.
 *
 * scaleY anchored at the bottom, not opacity: a chart fading in reads as
 * loading, where one rising off its own axis reads as being drawn. Starts at
 * ENTRANCE_START of full height for the same reason the gauges do — most of
 * the truth is already on screen, and the motion is the last of it arriving.
 */
export function useChartEntrance(options: SettleOptions = {}): {
  scaleY: Animated.Value;
  opacity: Animated.Value;
  animating: boolean;
} {
  const entrance = useRef<boolean | null>(null);
  if (entrance.current === null) entrance.current = claimEntranceShared();
  const first = entrance.current;

  const scaleY = useRef(new Animated.Value(first ? ENTRANCE_START : 1)).current;
  const opacity = useRef(new Animated.Value(first ? 0.35 : 1)).current;

  useEffect(() => {
    if (!first) return;
    const animation = Animated.parallel([
      Animated.timing(scaleY, {
        toValue: 1,
        duration: options.duration ?? ENTRANCE_DURATION,
        delay: options.delay ?? 0,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: (options.duration ?? ENTRANCE_DURATION) * 0.7,
        delay: options.delay ?? 0,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [first, scaleY, opacity, options.delay, options.duration]);

  return { scaleY, opacity, animating: first };
}
