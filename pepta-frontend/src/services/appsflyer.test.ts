import { describe, expect, it, vi } from "vitest";
import { createAppsFlyerService } from "./appsflyer";

function makeNativeClient(calls: string[] = []) {
  return {
    initSdk: vi.fn((options, success?: () => void) => {
      calls.push("init");
      success?.();
    }),
    startSdk: vi.fn(() => {
      calls.push("start");
    }),
    disableSKAD: vi.fn((disabled: boolean) => {
      calls.push(`skan:${disabled ? "disabled" : "enabled"}`);
    }),
    setCustomerUserId: vi.fn((userId: string, success?: () => void) => {
      calls.push(`customer:${userId}`);
      success?.();
    }),
    logEvent: vi.fn((_name: string, _values: Record<string, string>, success?: () => void) => {
      success?.();
    }),
    getAppsFlyerUID: vi.fn((callback: (error: unknown, uid?: string) => void) => {
      callback(null, "af-uid-1");
    }),
  };
}

describe("AppsFlyer service", () => {
  it("requests ATT, enables SKAN, and sets the customer user id before SDK start", async () => {
    const calls: string[] = [];
    const nativeClient = makeNativeClient(calls);
    const requestTrackingPermissions = vi.fn(async () => {
      calls.push("att");
      return { status: "granted", granted: true };
    });
    const service = createAppsFlyerService({
      appId: "6784368155",
      devKey: "test-dev-key",
      platformOS: "ios",
      devMode: true,
      nativeClient,
      requestTrackingPermissions,
      isTrackingTransparencyAvailable: () => true,
    });

    await expect(service.initialize("user_1")).resolves.toBe(true);

    expect(calls).toEqual([
      "att",
      "skan:enabled",
      "customer:user_1",
      "init",
      "start",
    ]);
    expect(nativeClient.initSdk).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: "6784368155",
        devKey: "test-dev-key",
        isDebug: true,
        manualStart: true,
        onDeepLinkListener: false,
        onInstallConversionDataListener: false,
      }),
      expect.any(Function),
      expect.any(Function),
    );
  });

  it("keeps AppsFlyer debug mode off outside development", async () => {
    const nativeClient = makeNativeClient();
    const service = createAppsFlyerService({
      appId: "6784368155",
      devKey: "test-dev-key",
      platformOS: "ios",
      devMode: false,
      nativeClient,
      requestTrackingPermissions: async () => ({ status: "granted", granted: true }),
      isTrackingTransparencyAvailable: () => true,
    });

    await service.initialize("user_1");

    expect(nativeClient.initSdk).toHaveBeenCalledWith(
      expect.objectContaining({ isDebug: false }),
      expect.any(Function),
      expect.any(Function),
    );
  });

  it("logs successful registration without purchase events", async () => {
    const nativeClient = makeNativeClient();
    const service = createAppsFlyerService({
      appId: "6784368155",
      devKey: "test-dev-key",
      platformOS: "ios",
      devMode: false,
      nativeClient,
    });

    await service.logCompleteRegistration({ method: "google" });

    expect(nativeClient.logEvent).toHaveBeenCalledWith(
      "af_complete_registration",
      { af_registration_method: "google" },
      expect.any(Function),
      expect.any(Function),
    );
    expect(nativeClient.logEvent).not.toHaveBeenCalledWith(
      "af_purchase",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
});
