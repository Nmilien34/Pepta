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
   * Per-package trial eligibility — PACKAGE-AGNOSTIC by contract: every
   * consumer derives trial UI from a package's own introPrice plus ITS entry
   * here, so adding or removing an intro offer on any product in App Store
   * Connect reflects in the app with no code change. `eligible` is false on
   * Android, on error, and — per TRIAL_COPY_PERMISSIVE_ON_UNKNOWN — on an
   * explicit INELIGIBLE.
   */
  trial: {
    monthly: TrialEligibilityResult;
    yearly: TrialEligibilityResult;
  };
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
  setEmail?(email: string): Promise<void>;
  setDisplayName?(displayName: string): Promise<void>;
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

export interface TrialEligibilityResult {
  eligible: boolean;
  /** Apple's numeric status, for diagnostics; null when the check never ran. */
  rawStatus: number | null;
}

const NOT_ELIGIBLE: TrialEligibilityResult = { eligible: false, rawStatus: null };

/**
 * iOS-only, resolved for ALL given products in one SDK call. Android, a
 * missing SDK static, and any thrown error resolve every product to
 * not-eligible: the callers use this to decide whether to promise a $0.00
 * trial, and the only safe default for a price claim is "do not make it".
 * Within a successful check, the mapping is governed by
 * TRIAL_COPY_PERMISSIVE_ON_UNKNOWN above.
 */
async function resolveTrialEligibilities(
  sdk: RevenueCatSdk,
  productIdentifiers: string[],
  platformOS: string,
): Promise<Record<string, TrialEligibilityResult>> {
  const fallback = Object.fromEntries(productIdentifiers.map((id) => [id, NOT_ELIGIBLE]));
  if (platformOS !== "ios" || productIdentifiers.length === 0) return fallback;
  if (typeof sdk.checkTrialOrIntroductoryPriceEligibility !== "function") {
    return fallback;
  }
  try {
    const result = await sdk.checkTrialOrIntroductoryPriceEligibility(productIdentifiers);
    return Object.fromEntries(
      productIdentifiers.map((id) => {
        const status = result?.[id]?.status;
        const rawStatus = typeof status === "number" ? status : null;
        const eligible = TRIAL_COPY_PERMISSIVE_ON_UNKNOWN
          ? rawStatus !== null && rawStatus !== INTRO_ELIGIBILITY_INELIGIBLE
          : rawStatus === INTRO_ELIGIBILITY_ELIGIBLE;
        return [id, { eligible, rawStatus }];
      }),
    );
  } catch {
    // An unreachable eligibility check is not a reason to block the paywall —
    // it is a reason to sell it without the trial claim.
    return fallback;
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

  async function identify(
    appUserId: string,
    attributes?: { email?: string | null; displayName?: string | null },
  ): Promise<void> {
    assertAvailable();
    await configure();

    if (currentUserId !== appUserId) {
      await sdk.logIn(appUserId);
      currentUserId = appUserId;
    }

    // Subscriber attributes so RC customer records are findable by email
    // instead of a Mongo ObjectId lookup. Best-effort by design: attribute
    // failures must never break identify (which gates the paywall).
    if (attributes?.email && typeof sdk.setEmail === "function") {
      await sdk.setEmail(attributes.email).catch(() => undefined);
    }
    if (attributes?.displayName && typeof sdk.setDisplayName === "function") {
      await sdk.setDisplayName(attributes.displayName).catch(() => undefined);
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
    const yearly = assertPackage(
      offering.annual ?? packageByIdentifier(offerings, "$rc_annual"),
      "yearly",
    );
    // One batched check for every product on the wall — per-package results.
    const eligibility = await resolveTrialEligibilities(
      sdk,
      [monthly.product.identifier, yearly.product.identifier],
      platformOS,
    );

    return {
      monthly,
      yearly,
      offeringId: offering.identifier,
      trial: {
        monthly: eligibility[monthly.product.identifier] ?? NOT_ELIGIBLE,
        yearly: eligibility[yearly.product.identifier] ?? NOT_ELIGIBLE,
      },
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

  /** The RevenueCat customer this device is currently identified as. */
  function currentAppUserId(): string | null {
    return currentUserId;
  }

  return {
    isAvailable,
    configure,
    identify,
    currentAppUserId,
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
