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

describe("PeptaApi account", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    api.setAuthToken(null);
  });

  it("patches account identity and parses the updated user", async () => {
    const responseBody = {
      data: {
        id: "user-1",
        email: "nick@pepta.app",
        emailVerified: true,
        displayName: "Nico Pepta",
        authProviders: [],
        entitlement: { status: "free", expiresAt: null, willRenew: false },
        onboardingComplete: true,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
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

    const result = await api.updateAccount({ displayName: "Nico Pepta" });

    expect(result.displayName).toBe("Nico Pepta");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/me/account",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ displayName: "Nico Pepta" }),
      }),
    );
  });

  it("fetches the current user for entitlement refreshes", async () => {
    const responseBody = {
      data: {
        id: "user-1",
        email: "nick@pepta.app",
        emailVerified: true,
        displayName: "Nico Pepta",
        authProviders: [],
        entitlement: {
          status: "active",
          expiresAt: "2026-08-01T00:00:00.000Z",
          willRenew: true,
          revenueCatCustomerId: "user-1",
          revenueCatEntitlement: "pro",
        },
        onboardingComplete: true,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
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

    const result = await api.getCurrentUser();

    expect(result.entitlement.status).toBe("active");
    expect(result.entitlement.revenueCatEntitlement).toBe("pro");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://localhost:8080/me");
    expect(init).not.toHaveProperty("method");
  });

  it("deletes the account through the account endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(null, {
          status: 204,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.deleteAccount();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/me/account",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});

describe("PeptaApi resilience", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    api.setAuthToken(null);
    api.setUnauthorizedHandler(undefined);
  });

  const json401 = () =>
    new Response(JSON.stringify({ error: { code: "UNAUTHORIZED" } }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });

  it("signs the user out (calls the handler + clears the token) on a 401", async () => {
    const onUnauthorized = vi.fn();
    api.setUnauthorizedHandler(onUnauthorized);
    api.setAuthToken("stale-token");
    const fetchMock = vi.fn(async () => json401());
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.getHome()).rejects.toThrow();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    // 401 is a deterministic 4xx → not retried.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries an idempotent GET once on a transient network failure", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Network request failed");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.getHome()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a POST on failure (avoids double-writes)", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Network request failed");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      api.createWaterLog({ amountOz: 8, datetime: NOW.toISOString() }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
