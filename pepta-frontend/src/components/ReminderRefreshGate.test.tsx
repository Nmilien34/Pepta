// The self-heal re-sync (2026-08-11). Local notifications are pre-composed,
// so copy changes only reach the OS on a reschedule. This gate reschedules on
// foreground — but three ways of getting that wrong are each destructive, so
// they're pinned here.

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  home: null as unknown,
  schedules: null as unknown,
  permission: "granted" as "granted" | "denied" | "undetermined",
  savedState: { dose_due: true } as Record<string, boolean>,
  sync: vi.fn(
    async (
      _groups: Array<{ items: Array<{ id: string; notification?: { title: string } }> }>,
      _state: Record<string, boolean>,
    ) => ({ permissionStatus: "granted", scheduledCount: 1, canceledCount: 0 }),
  ),
  readPermission: vi.fn(async () => mocks.permission),
  loadState: vi.fn(async () => mocks.savedState),
  appStateListeners: [] as Array<(state: string) => void>,
}));

vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (_event: string, cb: (state: string) => void) => {
      mocks.appStateListeners.push(cb);
      return { remove: vi.fn() };
    },
  },
}));

vi.mock("../context/PeptaDataContext", () => ({
  usePeptaData: () => ({ home: mocks.home, track: null, schedules: mocks.schedules }),
}));

vi.mock("../services/reminderNotification.service", () => ({
  loadReminderState: mocks.loadState,
  readReminderPermissionStatus: mocks.readPermission,
  syncReminderNotifications: mocks.sync,
}));

import { ReminderRefreshGate } from "./ReminderRefreshGate";

const HOME = {
  activeCompounds: [
    { id: "c1", name: "Foundayo", route: "oral", doseUnit: "mg", halfLifeDays: 1 },
  ],
  medicationLevels: [],
  nextDose: {
    compoundId: "c1",
    compoundName: "Foundayo",
    nextDoseAt: "2026-08-12T13:00:00.000Z",
    hoursUntilNextDose: 5,
  },
  profile: null,
  insights: [],
  streakDays: 0,
  todayCalories: 0,
  todayProteinGrams: 0,
  todayFiberGrams: 0,
  todayWaterOz: 0,
  latestWeight: null,
};

async function render() {
  let tree: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    tree = TestRenderer.create(<ReminderRefreshGate />);
  });
  return tree!;
}

describe("ReminderRefreshGate", () => {
  beforeEach(() => {
    mocks.home = null;
    mocks.schedules = null;
    mocks.permission = "granted";
    mocks.appStateListeners.length = 0;
    mocks.sync.mockClear();
    mocks.loadState.mockClear();
  });

  it("re-syncs once home data is loaded, carrying the route-aware copy", async () => {
    mocks.home = HOME;
    await render();
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    const groups = mocks.sync.mock.calls[0]![0];
    const doseDue = groups.flatMap((g) => g.items).find((i) => i.id === "dose_due")!;
    expect(doseDue.notification!.title).toBe("Pep: dose time");
  });

  it("NEVER syncs without home data — that would cancel live reminders and schedule nothing", async () => {
    mocks.home = null;
    await render();
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("NEVER syncs when permission isn't already granted — no surprise prompt, no wipe", async () => {
    mocks.home = HOME;
    mocks.permission = "denied";
    await render();
    expect(mocks.readPermission).toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("respects the user's saved toggles rather than re-enabling defaults", async () => {
    mocks.home = HOME;
    mocks.savedState = { dose_due: false, protein_anchor: true };
    await render();
    expect(mocks.sync.mock.calls[0]![1]).toEqual({ dose_due: false, protein_anchor: true });
    mocks.savedState = { dose_due: true };
  });

  it("re-syncs on foreground, but only when the composed output actually changed", async () => {
    mocks.home = HOME;
    await render();
    expect(mocks.sync).toHaveBeenCalledTimes(1);

    // Same data → foregrounding is a no-op.
    await act(async () => {
      mocks.appStateListeners.forEach((listener) => listener("active"));
    });
    expect(mocks.sync).toHaveBeenCalledTimes(1);
  });

  it("ignores background/inactive transitions", async () => {
    mocks.home = HOME;
    await render();
    mocks.sync.mockClear();
    await act(async () => {
      mocks.appStateListeners.forEach((listener) => listener("background"));
    });
    expect(mocks.sync).not.toHaveBeenCalled();
  });
});
