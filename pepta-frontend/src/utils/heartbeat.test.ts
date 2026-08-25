// The heartbeat behind hold-to-commit.
//
// A ramp is the wrong shape here. `buildHapticRamp` places single taps that
// crowd together — it reads as one swelling sensation, which is right for a
// progress ring closing. A commitment should feel like a PULSE: paired taps,
// lub then dub, with a rest between beats, quickening as the hold completes.
// The pairing is the whole illusion, so most of what follows is about it.

import { describe, expect, it } from "vitest";
import { buildHeartbeat, HEARTBEAT_GAP_MS, HOLD_MS } from "./heartbeat";

// The REAL hold, imported rather than guessed: the beat count depends on it,
// so a test with its own number would pass while the shipped feel changed.
const HOLD = HOLD_MS;

describe("it beats in pairs", () => {
  it("emits an even number of taps — every lub has a dub", () => {
    const beats = buildHeartbeat({ durationMs: HOLD });

    expect(beats.length).toBeGreaterThan(0);
    expect(beats.length % 2).toBe(0);
  });

  it("puts the two halves of a beat close enough to read as one", () => {
    // Past roughly 200ms apart the ear-equivalent stops hearing "lub-dub" and
    // starts hearing two separate knocks.
    const beats = buildHeartbeat({ durationMs: HOLD });

    for (let i = 0; i < beats.length; i += 2) {
      const gap = beats[i + 1]!.atMs - beats[i]!.atMs;
      expect(gap).toBe(HEARTBEAT_GAP_MS);
      expect(gap).toBeLessThan(200);
    }
  });

  it("hits the dub harder than the lub", () => {
    // The second sound of a real heartbeat is the sharper one.
    const beats = buildHeartbeat({ durationMs: HOLD });

    for (let i = 0; i < beats.length; i += 2) {
      expect(beats[i]!.style).toBe("soft");
      expect(beats[i + 1]!.style).toBe("medium");
    }
  });
});

describe("it quickens toward the commitment", () => {
  it("shortens the rest between beats as the hold goes on", () => {
    const beats = buildHeartbeat({ durationMs: HOLD });
    const starts = beats.filter((_, i) => i % 2 === 0).map((b) => b.atMs);
    const rests = starts.slice(1).map((t, i) => t - starts[i]!);

    expect(rests.length).toBeGreaterThan(2);
    for (let i = 1; i < rests.length; i++) {
      expect(rests[i]!).toBeLessThan(rests[i - 1]!);
    }
  });

  it("stays inside a plausible pulse range", () => {
    // Slower than 50bpm reads as a stall; faster than 150 as a panic. The
    // point is resolve, not alarm.
    const beats = buildHeartbeat({ durationMs: HOLD });
    const starts = beats.filter((_, i) => i % 2 === 0).map((b) => b.atMs);
    const rests = starts.slice(1).map((t, i) => t - starts[i]!);

    for (const rest of rests) {
      expect(60000 / rest).toBeGreaterThanOrEqual(50);
      expect(60000 / rest).toBeLessThanOrEqual(150);
    }
  });

  it("leaves the success notification a clear run at the end", () => {
    // Not merely "inside the hold" — a dub 39ms before the ring closes smears
    // into the confirmation. Found at durationMs 1000, which the component
    // permits because durationMs is a public prop.
    for (const durationMs of [640, 900, 1000, 1456, 1800, HOLD_MS, 3000]) {
      const taps = buildHeartbeat({ durationMs });
      const last = taps[taps.length - 1]!;

      expect(last.atMs).toBeLessThanOrEqual(durationMs);
      expect(durationMs - last.atMs).toBeGreaterThanOrEqual(60);
    }
  });

  it("starts on the beat, not after a silence", () => {
    // The first thump has to answer the finger going down, or the hold feels
    // unacknowledged for its first half-second.
    expect(buildHeartbeat({ durationMs: HOLD })[0]!.atMs).toBe(0);
  });
});

describe("it refuses nonsense rather than throwing", () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("%p yields nothing", (durationMs) => {
    expect(buildHeartbeat({ durationMs })).toEqual([]);
  });

  it("gives a very short hold at least one whole beat", () => {
    const beats = buildHeartbeat({ durationMs: 260 });

    expect(beats).toHaveLength(2);
    expect(beats[1]!.atMs).toBeLessThanOrEqual(260);
  });
});
