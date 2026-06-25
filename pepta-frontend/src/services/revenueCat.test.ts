import { describe, expect, it, vi } from "vitest";
import {
  REVENUECAT_ENTITLEMENT_ID,
  createRevenueCatClient,
  isRevenueCatPurchaseCancelled,
} from "./revenueCat";

function customerInfo(active = true) {
  return {
    entitlements: {
      active: active
        ? {
            [REVENUECAT_ENTITLEMENT_ID]: {
              identifier: REVENUECAT_ENTITLEMENT_ID,
              isActive: true,
              expirationDate: "2026-08-01T00:00:00.000Z",
              willRenew: true,
            },
          }
        : {},
      all: {},
    },
  };
}

function makePackage(identifier: string, productIdentifier: string) {
  return {
    identifier,
    product: {
      identifier: productIdentifier,
      priceString: productIdentifier === "yearly" ? "$40.00" : "$9.00",
    },
  };
}

function makeSdk() {
  const monthly = makePackage("$rc_monthly", "monthly");
  const yearly = makePackage("$rc_annual", "yearly");
  return {
    monthly,
    yearly,
    sdk: {
      configure: vi.fn(),
      getOfferings: vi.fn().mockResolvedValue({
        current: {
          identifier: "default",
          monthly,
          annual: yearly,
          availablePackages: [monthly, yearly],
        },
        all: {},
      }),
      logIn: vi.fn().mockResolvedValue({ customerInfo: customerInfo(), created: false }),
      logOut: vi.fn().mockResolvedValue(customerInfo(false)),
      purchasePackage: vi.fn().mockResolvedValue({
        productIdentifier: "yearly",
        customerInfo: customerInfo(),
      }),
      restorePurchases: vi.fn().mockResolvedValue(customerInfo()),
      setLogHandler: vi.fn(),
      setLogLevel: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe("RevenueCat client", () => {
  it("configures with the iOS key and backend user id, then logs in when the user changes", async () => {
    const { sdk } = makeSdk();
    const client = createRevenueCatClient({
      sdk,
      apiKey: "appl_test_key",
      platformOS: "ios",
      devMode: false,
    });

    await client.identify("user_1");
    await client.identify("user_1");
    await client.identify("user_2");

    expect(sdk.configure).toHaveBeenCalledTimes(1);
    expect(sdk.configure).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "appl_test_key", appUserID: "user_1" }),
    );
    expect(sdk.logIn).toHaveBeenCalledTimes(1);
    expect(sdk.logIn).toHaveBeenCalledWith("user_2");
  });

  it("routes RevenueCat dev errors through warn so LogBox does not red-screen", async () => {
    const { sdk } = makeSdk();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = createRevenueCatClient({
      sdk,
      apiKey: "appl_test_key",
      platformOS: "ios",
      devMode: true,
    });

    await client.identify("user_1");

    expect(sdk.setLogHandler).toHaveBeenCalledTimes(1);
    const logHandler = sdk.setLogHandler.mock.calls[0]?.[0];
    expect(logHandler).toBeTypeOf("function");

    logHandler?.("ERROR", "Error fetching offerings");

    expect(warn).toHaveBeenCalledWith("[RevenueCat] Error fetching offerings");
    expect(error).not.toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
  });

  it("loads monthly and yearly packages from the default offering", async () => {
    const { sdk, monthly, yearly } = makeSdk();
    const client = createRevenueCatClient({
      sdk,
      apiKey: "appl_test_key",
      platformOS: "ios",
      devMode: false,
    });

    const packages = await client.getPaywallPackages("user_1");

    expect(packages).toEqual({ monthly, yearly });
    expect(sdk.getOfferings).toHaveBeenCalledTimes(1);
  });

  it("purchases the selected package and reports whether the pro entitlement is active", async () => {
    const { sdk, yearly } = makeSdk();
    const client = createRevenueCatClient({
      sdk,
      apiKey: "appl_test_key",
      platformOS: "ios",
      devMode: false,
    });

    const result = await client.purchasePlan("user_1", "yearly");

    expect(sdk.purchasePackage).toHaveBeenCalledWith(yearly);
    expect(result.entitlementActive).toBe(true);
  });

  it("restores purchases and reports active pro access", async () => {
    const { sdk } = makeSdk();
    const client = createRevenueCatClient({
      sdk,
      apiKey: "appl_test_key",
      platformOS: "ios",
      devMode: false,
    });

    const result = await client.restore("user_1");

    expect(sdk.restorePurchases).toHaveBeenCalledTimes(1);
    expect(result.entitlementActive).toBe(true);
  });

  it("does not configure on unsupported platforms or missing keys", async () => {
    const { sdk } = makeSdk();
    const client = createRevenueCatClient({
      sdk,
      apiKey: "",
      platformOS: "ios",
      devMode: false,
    });

    await expect(client.getPaywallPackages("user_1")).rejects.toThrow(
      "RevenueCat is not configured",
    );
    expect(sdk.configure).not.toHaveBeenCalled();
  });

  it("detects user-cancelled purchase errors", () => {
    expect(isRevenueCatPurchaseCancelled({ userCancelled: true })).toBe(true);
    expect(isRevenueCatPurchaseCancelled(new Error("network"))).toBe(false);
  });
});
