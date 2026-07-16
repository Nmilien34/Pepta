import { afterEach, describe, expect, it, vi } from "vitest";

async function loadAppConfig() {
  vi.resetModules();
  const module = await import("../../app.config.js");
  return module.default ?? module;
}

describe("Expo app config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exposes AppsFlyer build-time env values like Leanient", async () => {
    vi.stubEnv("EXPO_PUBLIC_APPSFLYER_DEV_KEY", "test-dev-key");
    vi.stubEnv("EXPO_PUBLIC_APPSFLYER_APP_ID", "6784368155");
    vi.stubEnv("EXPO_PUBLIC_APPSFLYER_DIAGNOSTIC_EVENT_ENABLED", "true");

    const config = await loadAppConfig();

    expect(config.expo.extra).toEqual(
      expect.objectContaining({
        appsFlyerDevKey: "test-dev-key",
        appsFlyerAppId: "6784368155",
        appsFlyerDiagnosticEventEnabled: true,
      }),
    );
    expect(config.expo.plugins).toContainEqual([
      "react-native-appsflyer",
      expect.objectContaining({
        shouldUseStrictMode: false,
        shouldUsePurchaseConnector: false,
      }),
    ]);
  });
});
