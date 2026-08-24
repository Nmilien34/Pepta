import { describe, expect, it } from "vitest";
import { computeProfileTargets } from "../../lib/profile-targets";
import type { UserProfileInput } from "@pepta/shared";

// The estimated goal date is a PROJECTION: "at this pace, from now". It was
// computed from journeyStartDate with TODAY's weight — mixed timeframes — so
// anyone whose journey is older than their remaining plan got a goal date in
// the past, stored on the profile and served forever. A real account showed
// "Projected · Nov 9" on 2026-08-24; the year it was hiding was 2025.

const profile = (over: Partial<UserProfileInput> = {}): UserProfileInput =>
  ({
    sex: "male",
    dateOfBirth: "1995-01-01",
    height: 180,
    heightUnit: "cm",
    currentWeight: 200,
    weightUnit: "lb",
    goalWeight: 170,
    goalWeightUnit: "lb",
    goalPace: "steady",
    activityLevel: "moderate",
    trainingStatus: "sometimes",
    goalType: "fat_loss",
    medicationStatus: "current",
    journeyStartDate: "2025-06-22",
    timezone: "America/New_York",
    ...over,
  }) as UserProfileInput;

describe("computeProfileTargets · estimatedGoalDate", () => {
  const NOW = new Date("2026-08-24T12:00:00.000Z");

  it("projects from NOW, so a long-running journey cannot yield a past date", () => {
    const targets = computeProfileTargets(profile(), NOW);

    expect(targets.estimatedGoalDate).not.toBeNull();
    // Strictly ahead of now — the whole defect was Nov 2025 served in Aug 2026.
    expect(targets.estimatedGoalDate! > "2026-08-24").toBe(true);
  });

  it("is indifferent to how long ago the journey began", () => {
    // Same person, same weight, same pace — the start date is history, not an
    // input to where they will be N weeks from now.
    const recent = computeProfileTargets(profile({ journeyStartDate: "2026-08-01" }), NOW);
    const veteran = computeProfileTargets(profile({ journeyStartDate: "2024-01-01" }), NOW);

    expect(recent.estimatedGoalDate).toBe(veteran.estimatedGoalDate);
  });

  it("still returns null when there is nothing to project", () => {
    const atGoal = computeProfileTargets(
      profile({ currentWeight: 170, goalWeight: 170 }),
      NOW,
    );

    expect(atGoal.estimatedGoalDate).toBeNull();
  });
});
