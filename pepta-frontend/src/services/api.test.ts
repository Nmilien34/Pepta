import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { buildOnboardingPayload } from "../screens/onboarding/onboardingPayload";

const NOW = new Date("2026-06-23T12:00:00.000Z");

describe("PeptaApi onboarding", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    api.setAuthToken(null);
  });

  it("parses the real onboarding result response shape", async () => {
    const payload = buildOnboardingPayload(
      {
        journeyStage: "none",
        genderIdentity: "woman",
        birthday: { year: 1992, month: 5, day: 13 },
        body: { units: "imperial", height: 66, weight: 184 },
        goalWeight: 169,
        activityLevel: "light",
        trainingStatus: "returning",
        biggestWorry: "losing_muscle",
      },
      NOW,
    );
    const responseBody = {
      data: {
        profile: {
          ...payload.profile,
          id: "profile-1",
          userId: "user-1",
          ageYears: payload.profile.ageYears ?? 34,
          dailyCalorieTarget: 1760,
          dailyProteinTargetGrams: 129,
          proteinGramsPerKg: 1.54,
          targetWeeklyLossPercent: 0.6,
          estimatedGoalDate: "2026-10-13",
          dailyFiberTargetGrams: 30,
          dailyWaterTargetOz: 94,
          dailyStepTarget: 8000,
          nutritionEngineVersion: "nutrition-v1",
          createdAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
        },
        lifestyleTargets: {
          dailyWaterTargetOz: 94,
          dailyFiberTargetGrams: 30,
          dailyStepTarget: 8000,
          adjustedFor: [],
        },
        planHighlights: ["Aim for 129g protein daily."],
      },
    };
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.completeOnboarding(payload);

    expect(result.planHighlights).toEqual(["Aim for 129g protein daily."]);
    expect(result.profile.id).toBe("profile-1");
    expect(result.lifestyleTargets.dailyWaterTargetOz).toBe(94);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/onboarding/complete",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
