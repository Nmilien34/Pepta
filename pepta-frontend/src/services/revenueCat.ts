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
  /** Identifier of the offering these packages came from (experiment arm). */
  offeringId: string;
  /**
   * Whether trial copy is permitted for the monthly product. False on
   * Android, on error, and — per TRIAL_COPY_PERMISSIVE_ON_UNKNOWN — on an
   * explicit INELIGIBLE. See monthlyCta().
   */
  monthlyTrialEligible: boolean;
  /** Apple's raw eligibility status for diagnostics; null if the check never ran. */
  monthlyTrialEligibilityStatus: number | null;
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
  checkTrialOrIntroductoryPriceEligibility?(
    productIdentifiers: string[],
  ): Promise<Record<string, { status: number }>>;
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

// The experiment assigns each user an offering server-side, surfaced as
// offerings.current. current ALWAYS wins; the `default` offering is only a
// fallback for the degenerate no-current case (pre-experiment both are the
// same object, so behavior there is unchanged).
function experimentOffering(offerings: PurchasesOfferings) {
  return offerings.current ?? offerings.all[REVENUECAT_OFFERING_ID] ?? null;
}

function packageByIdentifier(
  offerings: PurchasesOfferings,
  identifier: string,
): PurchasesPackage | undefined {
  const offering = experimentOffering(offerings);
  return offering?.availablePackages.find((pkg) => pkg.identifier === identifier);
}

// react-native-purchases INTRO_ELIGIBILITY_STATUS. Inlined as a literal rather
// than imported so this module keeps its structural-only dependency on the SDK
// (which is what lets the whole client be unit-tested against a fake).
const INTRO_ELIGIBILITY_ELIGIBLE = 2;
const INTRO_ELIGIBILITY_INELIGIBLE = 1;

/**
 * When true, trial copy is permitted unless Apple says INELIGIBLE outright —
 * UNKNOWN (common on TestFlight and possible on fresh Apple IDs before a
 * StoreKit sync) no longer suppresses it. The tradeoff, accepted 2026-07-29:
 * we may occasionally advertise a trial that Apple then does not honor at
 * purchase. Flip to false to restore strict ELIGIBLE-only copy.
 */
export const TRIAL_COPY_PERMISSIVE_ON_UNKNOWN = true;

interface TrialEligibilityResult {
  eligible: boolean;
  /** Apple's numeric status, for diagnostics; null when the check never ran. */
  rawStatus: number | null;
}

/**
 * iOS-only. Android, a missing SDK static, and any thrown error resolve to
 * not-eligible: the caller uses this to decide whether to promise a $0.00
 * trial, and the only safe default for a price claim is "do not make it".
 * Within a successful check, the mapping is governed by
 * TRIAL_COPY_PERMISSIVE_ON_UNKNOWN above.
 */
async function resolveTrialEligibility(
  sdk: RevenueCatSdk,
  productIdentifier: string | undefined,
  platformOS: string,
): Promise<TrialEligibilityResult> {
  if (platformOS !== "ios" || !productIdentifier) return { eligible: false, rawStatus: null };
  if (typeof sdk.checkTrialOrIntroductoryPriceEligibility !== "function") {
    return { eligible: false, rawStatus: null };
  }
  try {
    const result = await sdk.checkTrialOrIntroductoryPriceEligibility([productIdentifier]);
    const status = result?.[productIdentifier]?.status;
    const rawStatus = typeof status === "number" ? status : null;
    const eligible = TRIAL_COPY_PERMISSIVE_ON_UNKNOWN
      ? rawStatus !== null && rawStatus !== INTRO_ELIGIBILITY_INELIGIBLE
      : rawStatus === INTRO_ELIGIBILITY_ELIGIBLE;
    return { eligible, rawStatus };
  } catch {
    // An unreachable eligibility check is not a reason to block the paywall —
    // it is a reason to sell it without the trial claim.
    return { eligible: false, rawStatus: null };
  }
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
    const offering = experimentOffering(offerings);

    if (!offering) {
      throw new Error("RevenueCat current offering is not available");
    }

    const monthly = assertPackage(
      offering.monthly ?? packageByIdentifier(offerings, "$rc_monthly"),
      "monthly",
    );
    const eligibility = await resolveTrialEligibility(
      sdk,
      monthly.product.identifier,
      platformOS,
    );

    return {
      monthly,
      yearly: assertPackage(
        offering.annual ?? packageByIdentifier(offerings, "$rc_annual"),
        "yearly",
      ),
      offeringId: offering.identifier,
      monthlyTrialEligible: eligibility.eligible,
      monthlyTrialEligibilityStatus: eligibility.rawStatus,
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
      // Loud in every build: AppsFlyer carries the funnel events, so a silent
      // init failure would mean silently missing funnel data.
      console.error("[AppsFlyer] init failed:", error);
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
