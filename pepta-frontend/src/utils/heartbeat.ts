// Heartbeat — the schedule behind hold-to-commit.
//
// WHY NOT `buildHapticRamp`. That places single taps that crowd and strengthen
// toward the end, which perceptually fuses into one swelling sensation. Right
// for a ring closing; wrong for a promise. A commitment should feel like a
// PULSE — paired taps, lub then dub, with a rest between beats — because a
// pulse is the body's own signal that something is at stake, and it quickens
// on its own as the moment arrives.
//
// The pairing carries the whole illusion. Two taps under ~200ms apart read as
// one event with a shape; past that they are just two knocks.
//
// Pure and RN-free like hapticRamp, so the timing unit-tests in plain Node.

/** Milliseconds between the lub and the dub. Tuned by feel, not derived. */
export const HEARTBEAT_GAP_MS = 128;

/**
 * How long the finger stays down.
 *
 * Exported so the screen and the tests cannot drift apart on it — the beat
 * count is a function of this, and at a true resting 62bpm a 1.8s hold fits
 * only three beats, which is too few to read as a rhythm at all.
 */
export const HOLD_MS = 2200;

/**
 * Start elevated rather than at rest. This is a moment of resolve, not a nap,
 * and the extra beats are what make the pattern legible inside two seconds.
 */
const BPM_START = 72;
const BPM_END = 140;

/**
 * Quiet tail before the hold completes.
 *
 * The success notification fires the instant the ring closes. A dub landing a
 * few dozen milliseconds earlier does not read as the last beat — it smears
 * into the confirmation and both feel mushy. At the shipped 2200ms the last
 * tap already clears by 111ms, but `durationMs` is a public prop and a 1000ms
 * hold lands one at 961ms, so the guard is here rather than in the caller.
 */
const SETTLE_MS = 90;

export type HeartbeatStyle = 'soft' | 'medium';

export interface HeartbeatTap {
  /** Milliseconds after the finger goes down. */
  atMs: number;
  style: HeartbeatStyle;
}

export interface HeartbeatOptions {
  /** How long the user must hold. Taps never land outside it. */
  durationMs: number;
}

/**
 * Beats across `durationMs`, accelerating from BPM_START to BPM_END.
 *
 * The first beat lands at 0 so the hold is acknowledged the instant the finger
 * touches down — a silent first half-second reads as the control not working.
 * A beat is only emitted if BOTH its taps fit inside the hold, so nothing
 * fires underneath the success notification at the end.
 */
export function buildHeartbeat({ durationMs }: HeartbeatOptions): HeartbeatTap[] {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return [];

  const taps: HeartbeatTap[] = [];
  let at = 0;

  const lastAllowed = durationMs - SETTLE_MS;
  while (at + HEARTBEAT_GAP_MS <= lastAllowed) {
    taps.push({ atMs: Math.round(at), style: 'soft' });
    taps.push({ atMs: Math.round(at + HEARTBEAT_GAP_MS), style: 'medium' });

    // Rate is interpolated on elapsed fraction, so the rest AFTER this beat is
    // already shorter than the one before it.
    const progress = Math.min(1, at / durationMs);
    const bpm = BPM_START + (BPM_END - BPM_START) * progress;
    at += 60000 / bpm;
  }

  // A hold too short for even one full beat still deserves its thump: the
  // control must never feel dead, however it is configured.
  if (taps.length === 0) {
    // Still one thump, still clear of the notification.
    return [
      { atMs: 0, style: 'soft' },
      { atMs: Math.round(Math.max(0, Math.min(HEARTBEAT_GAP_MS, lastAllowed))), style: 'medium' },
    ];
  }
  return taps;
}
