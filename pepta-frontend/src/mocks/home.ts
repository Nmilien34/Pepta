// Typed Home fixtures for context/screen tests. Minimal but type-complete against
// @pepta/shared (optional fields like rangeTotals are omitted). Use makeHome() to
// override the few fields a test cares about (e.g. todayProteinGrams).

import type { HomeResponse } from "@pepta/shared";

export const mockHome: HomeResponse = {
  profile: null,
  activeCompounds: [],
  medicationLevels: [],
  selectedRange: "today",
  todayProteinGrams: 40,
  todayFiberGrams: 10,
  todayCalories: 500,
  todayWaterOz: 24,
  streakDays: 3,
  setupProgress: { loggedItems: 2, required: 5, unlocked: false },
  nextDose: null,
  latestWeight: null,
  insights: [],
  weeklyRetention: null,
  sectionErrors: {},
};

export function makeHome(overrides: Partial<HomeResponse> = {}): HomeResponse {
  return { ...mockHome, ...overrides };
}
