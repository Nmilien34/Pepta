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

  it("parses the backend {error:{code}} envelope onto the thrown ApiError", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { code: "FORBIDDEN", message: "Upgrade required" } }),
          { status: 403, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.getHome()).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
      message: "Upgrade required",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1); // 403 is 4xx → not retried
  });

  it("sends the AI consent header only when Home explicitly asks for AI prose", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { code: "FORBIDDEN", message: "Upgrade required" } }),
          { status: 403, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      api.getHome("today", { aiDataSharingConsent: true }),
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/home",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-pepta-ai-consent": "true",
        }),
      }),
    );
  });
});

describe("PeptaApi coach chat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    api.setAuthToken(null);
  });

  it("posts Pep chat messages to the backend coach endpoint", async () => {
    api.setAuthToken("session-token");
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              reply: "You have enough context to focus on protein next.",
              refused: false,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.coachChat([
      { role: "user", text: "What should I focus on today?" },
    ]);

    expect(result.reply).toContain("protein");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/coach/chat",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer session-token",
        }),
        body: JSON.stringify({
          messages: [{ role: "user", text: "What should I focus on today?" }],
        }),
      }),
    );
  });
});

describe("PeptaApi meal product scans", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    api.setAuthToken(null);
  });

  const scanResponse = {
    data: {
      scanId: "scan-1",
      analysis: {
        foodName: "Chobani Zero Sugar Greek Yogurt",
        servingSize: "1 container",
        protein: 11,
        calories: 60,
        carbs: 5,
        fat: 0,
        fiber: 0,
        confidence: 0.88,
      },
      coachContent: null,
      note: "Review this packaged product before logging.",
      visionEngineVersion: "product-scan-v1",
      product: {
        mode: "product_scan",
        barcode: "081212903020",
        brand: "Chobani",
        productName: "Zero Sugar Greek Yogurt",
        source: "open_food_facts",
        citations: [
          {
            title: "Chobani Zero Sugar Greek Yogurt",
            url: "https://world.openfoodfacts.org/product/081212903020",
          },
        ],
      },
    },
  };

  it("posts product package photos to the product scan endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(scanResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.analyzeProductPhoto({
      imageData: "base64-image",
      imageMimeType: "image/png",
      capturedAt: NOW.toISOString(),
    });

    expect(result.product?.mode).toBe("product_scan");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/meal-scans/product",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          imageData: "base64-image",
          imageMimeType: "image/png",
          capturedAt: NOW.toISOString(),
        }),
      }),
    );
  });

  it("posts barcode scans to the barcode endpoint", async () => {
    const response = {
      data: {
        ...scanResponse.data,
        scanId: "barcode-1",
        visionEngineVersion: "barcode-lookup-v1",
        product: {
          ...scanResponse.data.product,
          mode: "barcode",
        },
      },
    };
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.analyzeMealBarcode({
      barcode: "081212903020",
      scannedAt: NOW.toISOString(),
    });

    expect(result.product?.mode).toBe("barcode");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/meal-scans/barcode",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          barcode: "081212903020",
          scannedAt: NOW.toISOString(),
        }),
      }),
    );
  });
});

describe("PeptaApi notification preferences", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    api.setAuthToken(null);
  });

  it("registers the current device Expo push token with the backend", async () => {
    api.setAuthToken("session-token");
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              token: "ExponentPushToken[abc123]",
              platform: "ios",
              enabled: true,
              lastSeenAt: NOW.toISOString(),
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.registerPushToken({
      token: "ExponentPushToken[abc123]",
      platform: "ios",
    });

    expect(result.enabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/me/push-tokens",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer session-token",
        }),
        body: JSON.stringify({
          token: "ExponentPushToken[abc123]",
          platform: "ios",
        }),
      }),
    );
  });

  it("updates AI-personalized push consent separately from notification permission", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              aiPushCopyConsent: true,
              aiPushCopyConsentAt: NOW.toISOString(),
              aiPushCopyConsentRevokedAt: null,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.updateNotificationPreferences({
      aiPushCopyConsent: true,
    });

    expect(result.aiPushCopyConsent).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/me/notification-preferences",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ aiPushCopyConsent: true }),
      }),
    );
  });
});
