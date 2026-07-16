import { Platform } from "react-native";
import Purchases, { LOG_LEVEL, type LogHandler } from "react-native-purchases";
import type {
  CustomerInfo,
  PurchasesOfferings,
  PurchasesPackage,
} from "react-native-purchases";
import { REVENUECAT_IOS_API_KEY } from "../config";
import { appsFlyer } from "./appsflyer";

export const REVENUECAT_ENTITLEMENT_ID = "pro";
export const REVENUECAT_OFFERING_ID = "default";

export type RevenueCatPlan = "monthly" | "yearly";

export interface PaywallPackages {
  monthly: PurchasesPackage;
  yearly: PurchasesPackage;
}

export interface RevenueCatResult {
  customerInfo: CustomerInfo;
  entitlementActive: boolean;
}

interface RevenueCatSdk {
  configure(configuration: { apiKey: string; appUserID?: string | null }): void;
  getOfferings(): Promise<PurchasesOfferings>;
  logIn(appUserID: string): Promise<unknown>;
  logOut(): Promise<CustomerInfo>;
  purchasePackage(aPackage: PurchasesPackage): Promise<{
    customerInfo: CustomerInfo;
    productIdentifier: string;
  }>;
  restorePurchases(): Promise<CustomerInfo>;
  collectDeviceIdentifiers?(): Promise<void>;
  setAppsflyerID?(appsflyerID: string | null): Promise<void>;
  setLogHandler?(handler: LogHandler): void;
  setLogLevel?(level: unknown): Promise<void>;
}

interface RevenueCatClientOptions {
  sdk: RevenueCatSdk;
  apiKey: string;
  platformOS: string;
  devMode: boolean;
  getAppsFlyerId?: (appUserId?: string) => Promise<string | undefined>;
  onAppsFlyerIdAvailable?: (listener: (appsFlyerId: string) => void) => () => void;
}

function assertPackage(
  aPackage: PurchasesPackage | null | undefined,
  name: string,
): PurchasesPackage {
  if (!aPackage) {
    throw new Error(`RevenueCat offering is missing the ${name} package`);
  }
  return aPackage;
}

function packageByIdentifier(
  offerings: PurchasesOfferings,
  identifier: string,
): PurchasesPackage | undefined {
  const offering = offerings.all[REVENUECAT_OFFERING_ID] ?? offerings.current;
  return offering?.availablePackages.find((pkg) => pkg.identifier === identifier);
}

function isActivePro(customerInfo: CustomerInfo): boolean {
  return Boolean(customerInfo.entitlements.active[REVENUECAT_ENTITLEMENT_ID]);
}

export function isRevenueCatPurchaseCancelled(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "userCancelled" in error &&
    (error as { userCancelled?: unknown }).userCancelled === true
  );
}

export function createRevenueCatClient(options: RevenueCatClientOptions) {
  const {
    sdk,
    apiKey,
    platformOS,
    devMode,
    getAppsFlyerId,
    onAppsFlyerIdAvailable,
  } = options;
  let configured = false;
  let logHandlerInstalled = false;
  let currentUserId: string | null = null;
  let unsubscribeAppsFlyerIdAvailable: (() => void) | undefined;

  function isAvailable(): boolean {
    return platformOS === "ios" && apiKey.trim().length > 0;
  }

  function assertAvailable(): void {
    if (!isAvailable()) {
      throw new Error("RevenueCat is not configured for this build");
    }
  }

  function installDevLogHandler(): void {
    if (!devMode || logHandlerInstalled || !sdk.setLogHandler) return;

    sdk.setLogHandler((level, message) => {
      const formatted = `[RevenueCat] ${message}`;
      if (level === LOG_LEVEL.ERROR || level === LOG_LEVEL.WARN) {
        console.warn(formatted);
        return;
      }
      if (level === LOG_LEVEL.DEBUG || level === LOG_LEVEL.VERBOSE) {
        console.debug(formatted);
        return;
      }
      console.info(formatted);
    });
    logHandlerInstalled = true;
  }

  function subscribeToAppsFlyerIdAvailability(): void {
    if (!onAppsFlyerIdAvailable || unsubscribeAppsFlyerIdAvailable) return;

    unsubscribeAppsFlyerIdAvailable = onAppsFlyerIdAvailable((appsFlyerId) => {
      void syncAppsFlyerAttribution(appsFlyerId).catch((error) => {
        if (devMode) {
          console.warn(
            "[RevenueCat] Could not sync AppsFlyer attribution after AppsFlyer ID became available.",
            error,
          );
        }
      });
    });
  }

  async function configure(): Promise<boolean> {
    if (!isAvailable()) {
      return false;
    }

    if (!configured) {
      installDevLogHandler();
      sdk.configure({ apiKey, appUserID: null });
      configured = true;
    }

    return true;
  }

  async function syncAppsFlyerAttribution(appsFlyerId?: string | null): Promise<void> {
    if (!configured) return;

    await sdk.collectDeviceIdentifiers?.();
    if (appsFlyerId) {
      await sdk.setAppsflyerID?.(appsFlyerId);
    }
  }

  async function syncAppsFlyerAttributionFromCurrentSdk(
    appUserId?: string,
  ): Promise<void> {
    let appsFlyerId: string | undefined;
    try {
      appsFlyerId = await getAppsFlyerId?.(appUserId);
    } catch (error) {
      if (devMode) {
        console.warn("[RevenueCat] Could not read AppsFlyer ID.", error);
      }
    }

    try {
      await syncAppsFlyerAttribution(appsFlyerId);
    } catch (error) {
      if (devMode) {
        console.warn("[RevenueCat] Could not sync AppsFlyer attribution.", error);
      }
    }
  }

  async function identify(appUserId: string): Promise<void> {
    assertAvailable();
    await configure();

    if (currentUserId !== appUserId) {
      await sdk.logIn(appUserId);
      currentUserId = appUserId;
    }

    await syncAppsFlyerAttributionFromCurrentSdk(appUserId);
  }

  async function getPaywallPackages(appUserId: string): Promise<PaywallPackages> {
    await identify(appUserId);
    const offerings = await sdk.getOfferings();
    const offering = offerings.all[REVENUECAT_OFFERING_ID] ?? offerings.current;

    if (!offering) {
      throw new Error("RevenueCat default offering is not available");
    }

    return {
      monthly: assertPackage(
        offering.monthly ?? packageByIdentifier(offerings, "$rc_monthly"),
        "monthly",
      ),
      yearly: assertPackage(
        offering.annual ?? packageByIdentifier(offerings, "$rc_annual"),
        "yearly",
      ),
    };
  }

  async function purchasePlan(
    appUserId: string,
    plan: RevenueCatPlan,
  ): Promise<RevenueCatResult> {
    const packages = await getPaywallPackages(appUserId);
    const selectedPackage = plan === "yearly" ? packages.yearly : packages.monthly;
    await syncAppsFlyerAttributionFromCurrentSdk(appUserId);
    const result = await sdk.purchasePackage(selectedPackage);
    return {
      customerInfo: result.customerInfo,
      entitlementActive: isActivePro(result.customerInfo),
    };
  }

  async function restore(appUserId: string): Promise<RevenueCatResult> {
    await identify(appUserId);
    const customerInfo = await sdk.restorePurchases();
    return {
      customerInfo,
      entitlementActive: isActivePro(customerInfo),
    };
  }

  async function reset(): Promise<void> {
    if (!configured || !currentUserId) return;
    await sdk.logOut();
    currentUserId = null;
  }

  subscribeToAppsFlyerIdAvailability();

  return {
    isAvailable,
    configure,
    identify,
    getPaywallPackages,
    purchasePlan,
    restore,
    reset,
  };
}

const devMode = typeof __DEV__ !== "undefined" ? __DEV__ : false;

export const revenueCat = createRevenueCatClient({
  sdk: Purchases,
  apiKey: REVENUECAT_IOS_API_KEY,
  platformOS: Platform.OS,
  devMode,
  getAppsFlyerId: async (appUserId?: string) => {
    const initialized = await appsFlyer.initialize(appUserId).catch((error) => {
      if (devMode) {
        console.warn("[RevenueCat] Could not initialize AppsFlyer.", error);
      }
      return false;
    });
    if (!initialized) return undefined;
    return appsFlyer.getAppsFlyerUID().catch((error) => {
      if (devMode) {
        console.warn("[RevenueCat] Could not read AppsFlyer ID.", error);
      }
      return undefined;
    });
  },
  onAppsFlyerIdAvailable: (listener) => appsFlyer.onAppsFlyerUIDAvailable(listener),
});
