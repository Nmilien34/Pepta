export interface PaywallPlanCopy {
  title: string;
  sub: string;
  price: string;
  per: string;
  badge?: string;
  /** Light line under the price — the billed total behind a per-month anchor. */
  priceNote?: string;
}

export interface PaywallCtaCopy {
  label: string;
  /** Apple-required auto-renewal disclosure when a trial is offered. */
  subline?: string;
}

export interface PaywallPricingCopy {
  monthly: PaywallPlanCopy;
  yearly: PaywallPlanCopy;
  footer: {
    monthly: string;
    yearly: string;
  };
  /** CTA per selectable plan, derived from the loaded products (trial-aware). */
  cta: {
    monthly: PaywallCtaCopy;
    yearly: PaywallCtaCopy;
  };
}

// Structural slice of react-native-purchases' intro offer. The experiment's
// treatment offering carries a free intro on the monthly product; control has
// introPrice = null. Copy is DERIVED from this — never hardcoded per arm.
interface StoreIntroPrice {
  price?: number | null;
  periodNumberOfUnits?: number | null;
  periodUnit?: string | null;
}

interface StoreProductPrice {
  price?: number | null;
  priceString?: string | null;
  currencyCode?: string | null;
  introPrice?: StoreIntroPrice | null;
}

interface PricePackage {
  product: StoreProductPrice;
}

// Annual price framing: the BOLD number is the per-month equivalent (the
// anchor buyers compare against monthly), with the billed yearly total in
// light type directly beneath it. App Review guideline 3.1.2(c) still rules:
// the BILLED amount must stay clearly visible — it renders adjacent under the
// anchor AND in the legal footer. Never ship the /mo anchor without both (an
// earlier build was rejected over paywall pricing clarity).
const FALLBACK_PRICING: PaywallPricingCopy = {
  yearly: {
    title: "Yearly",
    sub: "billed yearly",
    price: "$3.33",
    per: "/mo",
    priceNote: "$40.00/yr",
    badge: "SAVE 67%",
  },
  monthly: {
    title: "Monthly",
    sub: "billed monthly",
    price: "$9.99",
    per: "/mo",
  },
  footer: {
    yearly: "$40.00/year. Cancel anytime · Terms & Privacy",
    monthly: "$9.99/month. Cancel anytime · Terms & Privacy",
  },
  // Pre-load fallback: no product yet, so never advertise a trial.
  cta: {
    monthly: { label: "Subscribe" },
    yearly: { label: "Subscribe" },
  },
};

/** Free trial iff the product carries a zero-price introductory offer. */
export function freeTrialOf(
  pkg: PricePackage | null | undefined,
): { periodNumberOfUnits: number; periodUnit: string } | null {
  const intro = pkg?.product.introPrice;
  if (intro == null || intro.price !== 0) return null;
  const units = intro.periodNumberOfUnits;
  const unit = intro.periodUnit;
  if (typeof units !== "number" || units <= 0 || typeof unit !== "string") {
    return null;
  }
  return { periodNumberOfUnits: units, periodUnit: unit };
}

// "3 days", "1 week", … — duration comes from the product, never a literal.
// Reads as a noun ("Start 3 days for $0.00"), not the adjective form the old
// "3-day free trial" wording needed.
function trialDurationLabel(trial: { periodNumberOfUnits: number; periodUnit: string }): string {
  const unit = trial.periodUnit.toLowerCase();
  const plural = trial.periodNumberOfUnits === 1 ? unit : `${unit}s`;
  return `${trial.periodNumberOfUnits} ${plural}`;
}

function monthlyCta(
  monthly: PricePackage,
  price: string,
  trialEligible: boolean,
): PaywallCtaCopy {
  const trial = freeTrialOf(monthly);
  // ELIGIBILITY, NOT JUST EXISTENCE. `introPrice` describes the product as
  // configured; it says nothing about whether THIS user can still get it.
  // Anyone who already used an intro offer in this subscription group is
  // charged the full price immediately by StoreKit, so advertising "$0.00"
  // to them would be a false price claim on the paywall — worse than the old
  // "free trial" wording, which was merely optimistic. RevenueCat's own
  // guidance for an indeterminate answer is to show non-intro pricing.
  if (!trial || !trialEligible) return { label: "Subscribe" };
  return {
    // "$0.00" rather than "free": a concrete number reads as a real price the
    // user is being charged today, which converts better than the word free.
    label: `Start ${trialDurationLabel(trial)} for $0.00`,
    // Apple requires duration, the price after, and the auto-renewal
    // disclosure near the CTA. The reminder promise rides along — and is kept
    // by trialReminder.ts. Unwire that and this sentence must come out too.
    subline: `We'll remind you before it ends. Then ${price}/mo, auto-renews. Cancel anytime in Settings.`,
  };
}

function priceString(pkg: PricePackage | null | undefined, fallback: string): string {
  const value = pkg?.product.priceString;
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function numericPrice(pkg: PricePackage | null | undefined): number | null {
  const value = pkg?.product.price;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * "$3.33" from a $40.00/yr product — the per-month anchor. Uses the numeric
 * price for math and the priceString's leading symbol for display; if the
 * currency formats with a suffix (e.g. "39,99 €") we can't format faithfully,
 * so return null and the card falls back to showing the billed price bold.
 */
function monthlyEquivalent(yearly: PricePackage): string | null {
  const amount = numericPrice(yearly);
  if (!amount || amount <= 0) return null;
  const symbol = yearly.product.priceString?.match(/^[^\d-]*/)?.[0]?.trim();
  if (!symbol) return null;
  return `${symbol}${(amount / 12).toFixed(2)}`;
}

function savingsBadge(monthly: PricePackage, yearly: PricePackage): string | undefined {
  const monthlyAmount = numericPrice(monthly);
  const yearlyAmount = numericPrice(yearly);
  if (!monthlyAmount || !yearlyAmount) return FALLBACK_PRICING.yearly.badge;

  const yearlyFullPrice = monthlyAmount * 12;
  const savings = Math.round((1 - yearlyAmount / yearlyFullPrice) * 100);
  return savings > 0 ? `SAVE ${savings}%` : undefined;
}

export function buildPaywallPricing(
  packages: { monthly: PricePackage; yearly: PricePackage } | null,
  /**
   * Whether this user can actually receive the intro offer. Defaults to false
   * so a caller that has not resolved eligibility yet advertises no trial —
   * the safe direction is under-promising.
   */
  trialEligible = false,
): PaywallPricingCopy {
  if (!packages) return FALLBACK_PRICING;

  const monthly = packages.monthly;
  const yearly = packages.yearly;
  const monthlyPrice = priceString(monthly, FALLBACK_PRICING.monthly.price);
  const annualPrice = priceString(yearly, "$40.00");

  const perMonthAnchor = monthlyEquivalent(yearly);

  return {
    yearly: perMonthAnchor
      ? {
          title: "Yearly",
          sub: "billed yearly",
          price: perMonthAnchor,
          per: "/mo",
          priceNote: `${annualPrice}/yr`,
          badge: savingsBadge(monthly, yearly),
        }
      : {
          title: "Yearly",
          sub: "billed yearly",
          price: annualPrice,
          per: "/yr",
          badge: savingsBadge(monthly, yearly),
        },
    monthly: {
      title: "Monthly",
      sub: "billed monthly",
      price: monthlyPrice,
      per: "/mo",
    },
    footer: {
      yearly: `${annualPrice}/year. Cancel anytime · Terms & Privacy`,
      monthly: `${monthlyPrice}/month. Cancel anytime · Terms & Privacy`,
    },
    cta: {
      monthly: monthlyCta(monthly, monthlyPrice, trialEligible),
      // The annual product has no trial on either arm — identical both ways.
      yearly: { label: "Subscribe" },
    },
  };
}
