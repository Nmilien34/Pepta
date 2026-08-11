import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  },
}));

import {
  loadExplicitReminderIds,
  loadReminderState,
  markReminderExplicit,
  REMINDER_EXPLICIT_KEY,
  REMINDER_REPAIR_NOTICE_KEY,
  REMINDER_STORAGE_KEY,
  repairBuggedDoseReminderState,
} from "../../services/reminderNotification.service";
import type { ReminderGroup } from "../../screens/app/reminderSettings";

/** dose_due defaultOn true = the corrected derivation, with a real nextDoseAt. */
const groups: ReminderGroup[] = [
  {
    title: "DOSE CYCLE",
    items: [
      {
        id: "dose_due",
        icon: "needle",
        label: "Dose reminder",
        subtitle: "",
        defaultOn: true,
        schedule: { kind: "daily", hour: 9, minute: 0 },
      },
      {
        id: "post_dose_checkin",
        icon: "pulse",
        label: "Post-dose",
        subtitle: "",
        defaultOn: true,
        schedule: { kind: "date", datetime: "2026-08-12T13:00:00.000Z" },
      },
      {
        id: "hydration_check",
        icon: "water",
        label: "Hydration",
        subtitle: "",
        defaultOn: true,
        schedule: { kind: "daily", hour: 15, minute: 30 },
      },
    ],
  },
];

beforeEach(() => {
  store.clear();
});

describe("one-time dose reminder repair", () => {
  it("clears the bug-written dose_due:false so the corrected default applies", async () => {
    // What onboarding wrote for every user: derived from {home:null, track:null}.
    store.set(
      REMINDER_STORAGE_KEY,
      JSON.stringify({ dose_due: false, post_dose_checkin: false, hydration_check: true }),
    );

    const result = await repairBuggedDoseReminderState();
    expect(result.repaired).toEqual(["dose_due", "post_dose_checkin"]);

    const state = await loadReminderState(groups);
    expect(state.dose_due).toBe(true);
    expect(state.post_dose_checkin).toBe(true);
  });

  it("LEAVES EVERY OTHER PREFERENCE ALONE", async () => {
    store.set(
      REMINDER_STORAGE_KEY,
      JSON.stringify({ dose_due: false, hydration_check: false }),
    );

    await repairBuggedDoseReminderState();

    const state = await loadReminderState(groups);
    expect(state.dose_due).toBe(true);
    // The user switched hydration off themselves; the repair is not a reset.
    expect(state.hydration_check).toBe(false);
  });

  it("NEVER overrides an explicit off — the hard rule", async () => {
    store.set(REMINDER_STORAGE_KEY, JSON.stringify({ dose_due: false }));
    await markReminderExplicit("dose_due");

    const result = await repairBuggedDoseReminderState();

    expect(result.repaired).toEqual([]);
    const state = await loadReminderState(groups);
    expect(state.dose_due).toBe(false);
  });

  it("runs exactly once, so a later deliberate off is never undone", async () => {
    store.set(REMINDER_STORAGE_KEY, JSON.stringify({ dose_due: false }));
    await repairBuggedDoseReminderState();

    // The user then turns it off on purpose.
    store.set(REMINDER_STORAGE_KEY, JSON.stringify({ dose_due: false }));
    const second = await repairBuggedDoseReminderState();

    expect(second.repaired).toEqual([]);
    expect((await loadReminderState(groups)).dose_due).toBe(false);
  });

  it("leaves a user who already had dose reminders ON untouched", async () => {
    store.set(REMINDER_STORAGE_KEY, JSON.stringify({ dose_due: true }));

    const result = await repairBuggedDoseReminderState();

    expect(result.repaired).toEqual([]);
    expect((await loadReminderState(groups)).dose_due).toBe(true);
  });

  it("no-ops for a fresh install with nothing stored", async () => {
    const result = await repairBuggedDoseReminderState();
    expect(result.repaired).toEqual([]);
    expect(store.get(REMINDER_STORAGE_KEY)).toBeUndefined();
  });

  it("raises the notice only when it actually changed something", async () => {
    store.set(REMINDER_STORAGE_KEY, JSON.stringify({ dose_due: false }));
    await repairBuggedDoseReminderState();
    expect(store.get(REMINDER_REPAIR_NOTICE_KEY)).toBe("1");

    store.clear();
    store.set(REMINDER_STORAGE_KEY, JSON.stringify({ dose_due: true }));
    await repairBuggedDoseReminderState();
    expect(store.get(REMINDER_REPAIR_NOTICE_KEY)).toBeUndefined();
  });

  it("survives a corrupt stored blob without throwing", async () => {
    store.set(REMINDER_STORAGE_KEY, "not json");
    await expect(repairBuggedDoseReminderState()).resolves.toEqual({ repaired: [] });
  });
});

describe("intent ledger", () => {
  it("records the ids the user personally toggled", async () => {
    await markReminderExplicit("dose_due");
    await markReminderExplicit("hydration_check");

    expect([...(await loadExplicitReminderIds())].sort()).toEqual([
      "dose_due",
      "hydration_check",
    ]);
  });

  it("is idempotent", async () => {
    await markReminderExplicit("dose_due");
    await markReminderExplicit("dose_due");
    expect(JSON.parse(store.get(REMINDER_EXPLICIT_KEY)!)).toEqual(["dose_due"]);
  });

  it("treats a corrupt ledger as empty rather than crashing settings", async () => {
    store.set(REMINDER_EXPLICIT_KEY, "{{{");
    expect((await loadExplicitReminderIds()).size).toBe(0);
  });
});
