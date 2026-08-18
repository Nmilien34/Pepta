// The weight card's milestone track (design-lab "Home", option B).
//
// WHY NOT A PERCENTAGE. "2% of goal" is true and useless: early on it is a dot
// pinned to the left of a long bar, on the card someone opens daily in the
// stretch where quitting is easiest. A milestone view shows the same data and
// puts a reachable finish in front of them — "4.5 lb to go" instead of "29.5".
// It is the only framing here that gets BETTER the less progress there is.
//
// Nothing is invented. Markers are round numbers between start and goal, and
// every figure comes from weights the user logged.
//
// Pure and RN-free, so it unit-tests in plain Node.

export interface MilestoneTrack {
  /** Round-number marks between the current weight and the goal. */
  markers: number[];
  /** The next one they will cross, or null once the goal is the next thing. */
  next: number | null;
  /** Distance to `next` (or to the goal), always positive. */
  toNext: number;
  /** The goal itself — the flag at the end of the track. */
  goal: number;
  /** True once they are at or past the goal. */
  reached: boolean;
}

/** 5 lb / 2 kg — small enough to be weeks away, big enough to feel like a mark. */
export function milestoneStep(unit: 'lb' | 'kg'): number {
  return unit === 'kg' ? 2 : 5;
}

/**
 * Marks between `current` and `goal`, walking DOWN from the first round number
 * below the current weight. Losing is the only direction with markers: gaining
 * toward a goal gets the flag alone, because "next marker 185" reads as a
 * target to hit rather than one to pass.
 */
export function buildMilestoneTrack(
  current: number,
  goal: number,
  unit: 'lb' | 'kg' = 'lb',
  opts: { start?: number; maxMarkers?: number } = {},
): MilestoneTrack {
  const { start, maxMarkers = 5 } = opts;
  const step = milestoneStep(unit);
  // Direction comes from where they STARTED, not from where they are now.
  // Someone at 168 with a 170 goal has overshot a loss; without the start
  // weight that is indistinguishable from being below a gain target, and the
  // card would tell a finisher they have 2 lb still to gain.
  const losing = start != null ? goal < start : goal < current;
  const reached = losing ? current <= goal : current >= goal;

  if (reached || !losing) {
    return {
      markers: [],
      next: null,
      toNext: Math.abs(goal - current),
      goal,
      reached,
    };
  }

  const markers: number[] = [];
  // First mark strictly below the current weight, on the step grid.
  let mark = Math.floor(current / step) * step;
  if (mark >= current) mark -= step;
  while (mark > goal && markers.length < maxMarkers) {
    markers.push(mark);
    mark -= step;
  }

  const next = markers[0] ?? null;
  return {
    markers,
    next,
    toNext: Number((current - (next ?? goal)).toFixed(1)),
    goal,
    reached: false,
  };
}

/** "4.5 lb to go" — the pill, and the line under the track. */
export function milestoneLabel(track: MilestoneTrack, unit: 'lb' | 'kg' = 'lb'): string {
  if (track.reached) return 'Goal reached';
  const amount = track.toNext % 1 === 0 ? String(track.toNext) : track.toNext.toFixed(1);
  return `${amount} ${unit} to go`;
}
