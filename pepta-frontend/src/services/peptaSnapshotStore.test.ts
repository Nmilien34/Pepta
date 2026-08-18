import { describe, expect, it } from "vitest";
import { parseSnapshot, snapshotKey } from "./peptaSnapshotStore";

describe("parseSnapshot", () => {
  it("reads corrupt, hostile, or stale-shaped input as no snapshot", () => {
    // A snapshot is health data rendered straight into the dashboard; anything
    // that fails the live schemas must read as "no cache", never crash render.
    for (const raw of [
      null,
      "",
      "not json",
      "{}",
      "[]",
      '{"home":{"nonsense":true},"track":null,"progress":null,"savedAt":"2026-01-01T00:00:00.000Z"}',
      '{"home":null,"track":null,"progress":null}', // no savedAt
      '{"home":null,"track":null,"progress":null,"savedAt":"x"}', // all empty
    ]) {
      expect(parseSnapshot(raw)).toBeNull();
    }
  });

  it("keys strictly by user id", () => {
    expect(snapshotKey("a")).not.toBe(snapshotKey("b"));
    expect(snapshotKey("a")).toContain(":a");
  });
});

describe("cached scheduling", () => {
  const track = {
    doseLogs: [],
    mealLogs: [],
    waterLogs: [],
    proteinLogs: [],
    activityLogs: [],
    sideEffectLogs: [],
    measurements: [],
    weightLogs: [],
    sectionErrors: {},
  };
  const schedule = {
    id: "s1",
    userId: "u1",
    compoundId: "c1",
    frequency: "weekly",
    daysOfWeek: [6],
    active: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
  const wrap = (extra: Record<string, unknown>) =>
    JSON.stringify({
      home: null,
      track,
      progress: null,
      savedAt: "2026-08-13T00:00:00.000Z",
      ...extra,
    });

  it("round-trips the schedule so the cadence is known on cold start", () => {
    expect(parseSnapshot(wrap({ schedules: [schedule] }))?.schedules).toEqual([
      schedule,
    ]);
  });

  it("reads a snapshot written before scheduling was cached", () => {
    // Every v1 snapshot on every device today. It must still hydrate Home and
    // Track — losing that cache to add a bonus field would be a bad trade.
    const parsed = parseSnapshot(wrap({}));
    expect(parsed?.track).not.toBeNull();
    expect(parsed?.schedules).toBeNull();
    expect(parsed?.cycles).toBeNull();
  });

  it("drops corrupt scheduling without throwing away home and track", () => {
    const parsed = parseSnapshot(wrap({ schedules: [{ nonsense: true }] }));
    expect(parsed?.track).not.toBeNull();
    expect(parsed?.schedules).toBeNull();
  });

  it("treats a null schedule list as unknown, never as an empty schedule", () => {
    // The distinction is load-bearing: [] means "no schedule, cadence
    // unknowable" and null means "not fetched yet" — both show Home's log
    // button, but only a real list can ever hide it.
    expect(parseSnapshot(wrap({ schedules: null }))?.schedules).toBeNull();
    expect(parseSnapshot(wrap({ schedules: [] }))?.schedules).toEqual([]);
  });
});
