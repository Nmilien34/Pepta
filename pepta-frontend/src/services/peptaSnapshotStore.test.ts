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
