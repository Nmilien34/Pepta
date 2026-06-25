import { describe, expect, it } from "vitest";
import type {
  CompoundResponse,
  HomeResponse,
  SideEffectLogInput,
  TrackResponse,
} from "@pepta/shared";
import {
  homeWithAddedCompound,
  homeWithLatestWeight,
  trackWithAddedSideEffect,
} from "./PeptaDataContext";

const baseHome = {
  activeCompounds: [
    {
      id: "onboarding-compound",
      name: "Tirzepatide",
      drugClass: "dual_glp_1_gip",
      route: "injection",
      halfLifeDays: 5,
      doseUnit: "mg",
      plannedDose: 5,
      startDate: "2026-06-01",
      status: "active",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
  ],
} as HomeResponse;

const addedCompound = {
  id: "manual-compound",
  name: "Retatrutide",
  drugClass: "peptide",
  route: "injection",
  halfLifeDays: 6,
  doseUnit: "mg",
  plannedDose: 2,
  startDate: "2026-06-23",
  status: "active",
  createdAt: "2026-06-23T00:00:00.000Z",
  updatedAt: "2026-06-23T00:00:00.000Z",
} as CompoundResponse;

describe("homeWithAddedCompound", () => {
  it("adds a manually-created compound without replacing the onboarding compound", () => {
    const next = homeWithAddedCompound(baseHome, addedCompound);

    expect(next?.activeCompounds.map((compound) => compound.id)).toEqual([
      "manual-compound",
      "onboarding-compound",
    ]);
  });

  it("updates an existing compound instead of duplicating it", () => {
    const next = homeWithAddedCompound(baseHome, {
      ...baseHome.activeCompounds[0]!,
      plannedDose: 7.5,
    });

    expect(next?.activeCompounds).toHaveLength(1);
    expect(next?.activeCompounds[0]?.plannedDose).toBe(7.5);
  });
});

describe("homeWithLatestWeight", () => {
  it("updates the home latest weight after an optimistic weight log", () => {
    const next = homeWithLatestWeight(baseHome, {
      value: 183.5,
      unit: "lb",
      datetime: "2026-06-23T12:00:00.000Z",
    });

    expect(next?.latestWeight?.value).toBe(183.5);
    expect(next?.latestWeight?.unit).toBe("lb");
    expect(next?.latestWeight?.datetime).toBe("2026-06-23T12:00:00.000Z");
  });
});

describe("trackWithAddedSideEffect", () => {
  const sideEffect: SideEffectLogInput = {
    types: ["nausea"],
    severity: 3,
    datetime: "2026-06-23T13:00:00.000Z",
    notes: "After lunch",
  };

  it("creates a minimal track state when side effects are logged before Track loads", () => {
    const next = trackWithAddedSideEffect(null, sideEffect);

    expect(next.sideEffectLogs).toHaveLength(1);
    expect(next.sideEffectLogs[0]).toEqual(
      expect.objectContaining({
        types: ["nausea"],
        severity: 3,
        datetime: "2026-06-23T13:00:00.000Z",
        notes: "After lunch",
        deletedAt: null,
      }),
    );
    expect(next.doseLogs).toEqual([]);
    expect(next.sectionErrors).toEqual({});
  });

  it("prepends a side effect to existing track state", () => {
    const existing = {
      doseLogs: [],
      mealLogs: [],
      waterLogs: [],
      proteinLogs: [],
      activityLogs: [],
      sideEffectLogs: [
        {
          id: "older-side-effect",
          userId: "user",
          types: ["fatigue"],
          severity: 1,
          datetime: "2026-06-22T13:00:00.000Z",
          deletedAt: null,
          createdAt: "2026-06-22T13:00:00.000Z",
          updatedAt: "2026-06-22T13:00:00.000Z",
        },
      ],
      measurements: [],
      sectionErrors: {},
    } as TrackResponse;

    const next = trackWithAddedSideEffect(existing, sideEffect);

    expect(next.sideEffectLogs.map((log) => log.types[0])).toEqual([
      "nausea",
      "fatigue",
    ]);
  });
});
