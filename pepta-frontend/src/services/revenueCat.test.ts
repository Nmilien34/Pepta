import { describe, expect, it, vi } from "vitest";
import {
  REVENUECAT_ENTITLEMENT_ID,
  createRevenueCatClient,
  isRevenueCatPurchaseCancelled,
} from "./revenueCat";

type RevenueCatSdkOption = Parameters<typeof createRevenueCatClient>[0]["sdk"];

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
      priceString: productIdentifier === "yearly" ? "$40.00" : "$9.99",
    },
  };
}

function makeSdk(calls: string[] = []) {
  const monthly = makePackage("$rc_monthly", "monthly");
  const yearly = makePackage("$rc_annual", "yearly");
  const sdk = {
    configure: vi.fn(),
    collectDeviceIdentifiers: vi.fn(async () => {
      calls.push("collect-device-identifiers");
    }),
    setAppsflyerID: vi.fn(async (appsFlyerId: string | null) => {
      calls.push(`set-appsflyer-id:${appsFlyerId ?? "null"}`);
    }),
    getOfferings: vi.fn(async () => {
      calls.push("get-offerings");
      return {
        current: {
          identifier: "default",
          monthly,
          annual: yearly,
          availablePackages: [monthly, yearly],
        },
        all: {},
      };
    }),
    logIn: vi.fn(async (appUserId: string) => {
      calls.push(`login:${appUserId}`);
      return { customerInfo: customerInfo(), created: false };
    }),
    logOut: vi.fn().mockResolvedValue(customerInfo(false)),
    purchasePackage: vi.fn(async () => {
      calls.push("purchase");
      return {
        productIdentifier: "yearly",
        customerInfo: customerInfo(),
      };
    }),
    restorePurchases: vi.fn().mockResolvedValue(customerInfo()),
    setLogHandler: vi.fn(),
    setLogLevel: vi.fn().mockResolvedValue(undefined),
  };

  return {
    monthly,
    yearly,
    sdk: sdk as typeof sdk & RevenueCatSdkOption,
  };
}

describe("RevenueCat client", () => {
  it("configures anonymously, then logs in with the backend user id", async () => {
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
      expect.objectContaining({ apiKey: "appl_test_key", appUserID: null }),
    );
    expect(sdk.logIn).toHaveBeenCalledTimes(2);
    expect(sdk.logIn).toHaveBeenNthCalledWith(1, "user_1");
    expect(sdk.logIn).toHaveBeenNthCalledWith(2, "user_2");
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

  it("loads monthly and yearly packages from the current offering", async () => {
    const { sdk, monthly, yearly } = makeSdk();
    const client = createRevenueCatClient({
      sdk,
      apiKey: "appl_test_key",
      platformOS: "ios",
      devMode: false,
    });

    const packages = await client.getPaywallPackages("user_1");

    // Eligibility resolves false here: the fake SDK exposes no
    // checkTrialOrIntroductoryPriceEligibility, and an unanswerable check must
    // never let the paywall promise a trial.
    expect(packages).toEqual({
      monthly,
      yearly,
      offeringId: "default",
      monthlyTrialEligible: false,
    });
    expect(sdk.getOfferings).toHaveBeenCalledTimes(1);
  });

  it("renders the experiment's assigned offering: current beats the default", async () => {
    // Treatment user: offerings.current is the trial offering while `default`
    // still exists in `all`. The paywall must render current.
    const { sdk } = makeSdk();
    const trialMonthly = makePackage("$rc_monthly", "monthly-trial");
    const trialYearly = makePackage("$rc_annual", "yearly");
    const controlOffering = {
      identifier: "default",
      monthly: makePackage("$rc_monthly", "monthly"),
      annual: makePackage("$rc_annual", "yearly"),
      availablePackages: [] as unknown[],
    };
    sdk.getOfferings.mockResolvedValueOnce({
      current: {
        identifier: "trial-offer",
        monthly: trialMonthly,
        annual: trialYearly,
        availablePackages: [trialMonthly, trialYearly],
      },
      all: { default: controlOffering },
    } as never);
    const client = createRevenueCatClient({
      sdk,
      apiKey: "appl_test_key",
      platformOS: "ios",
      devMode: false,
    });

    const packages = await client.getPaywallPackages("user_1");

    expect(packages.offeringId).toBe("trial-offer");
    expect(packages.monthly).toBe(trialMonthly);
  });

  it("falls back to the default offering only when current is missing", async () => {
    const { sdk } = makeSdk();
    const monthly = makePackage("$rc_monthly", "monthly");
    const yearly = makePackage("$rc_annual", "yearly");
    sdk.getOfferings.mockResolvedValueOnce({
      current: null,
      all: {
        default: {
          identifier: "default",
          monthly,
          annual: yearly,
          availablePackages: [monthly, yearly],
        },
      },
    } as never);
    const client = createRevenueCatClient({
      sdk,
      apiKey: "appl_test_key",
      platformOS: "ios",
      devMode: false,
    });

    const packages = await client.getPaywallPackages("user_1");

    expect(packages.offeringId).toBe("default");
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

  it("sends AppsFlyer attribution identifiers to RevenueCat before purchases", async () => {
    const calls: string[] = [];
    const { sdk } = makeSdk(calls);
    const getAppsFlyerId = vi.fn(async (appUserId?: string) => {
      calls.push(`get-appsflyer-id:${appUserId ?? "anonymous"}`);
      return "af-uid-1";
    });
    const client = createRevenueCatClient({
      sdk,
      apiKey: "appl_test_key",
      platformOS: "ios",
      devMode: false,
      getAppsFlyerId,
    });

    await client.purchasePlan("user_1", "yearly");

    expect(getAppsFlyerId).toHaveBeenCalledWith("user_1");
    expect(sdk.collectDeviceIdentifiers).toHaveBeenCalledTimes(2);
    expect(sdk.setAppsflyerID).toHaveBeenCalledWith("af-uid-1");
    expect(calls).toEqual([
      "login:user_1",
      "get-appsflyer-id:user_1",
      "collect-device-identifiers",
      "set-appsflyer-id:af-uid-1",
      "get-offerings",
      "get-appsflyer-id:user_1",
      "collect-device-identifiers",
      "set-appsflyer-id:af-uid-1",
      "purchase",
    ]);
  });

  it("syncs a late AppsFlyer UID to RevenueCat after the user is logged in", async () => {
    const calls: string[] = [];
    const { sdk } = makeSdk(calls);
    let appsFlyerUidListener: ((appsFlyerId: string) => void) | undefined;
    const onAppsFlyerIdAvailable = vi.fn((listener: (appsFlyerId: string) => void) => {
      appsFlyerUidListener = listener;
      return vi.fn();
    });
    const client = createRevenueCatClient({
      sdk,
      apiKey: "appl_test_key",
      platformOS: "ios",
      devMode: false,
      getAppsFlyerId: vi.fn(async () => undefined),
      onAppsFlyerIdAvailable,
    });

    await client.identify("user_1");
    appsFlyerUidListener?.("af-uid-late");
    await Promise.resolve();
    await Promise.resolve();

    expect(onAppsFlyerIdAvailable).toHaveBeenCalledTimes(1);
    expect(sdk.logIn).toHaveBeenCalledWith("user_1");
    expect(sdk.setAppsflyerID).toHaveBeenCalledWith("af-uid-late");
    expect(calls).toEqual([
      "login:user_1",
      "collect-device-identifiers",
      "collect-device-identifiers",
      "set-appsflyer-id:af-uid-late",
    ]);
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
