export interface PaywallPlanCopy {
  title: string;
  sub: string;
  price: string;
  per: string;
  badge?: string;
}

export interface PaywallPricingCopy {
  monthly: PaywallPlanCopy;
  yearly: PaywallPlanCopy;
  footer: {
    monthly: string;
    yearly: string;
  };
}

interface StoreProductPrice {
  price?: number | null;
  priceString?: string | null;
  currencyCode?: string | null;
}

interface PricePackage {
  product: StoreProductPrice;
}

// App Review guideline 3.1.2(c): the BILLED amount must be the most conspicuous
// price on each plan. `price` is the big element in PlanCard, so it always
// carries the amount actually charged; calculated equivalents (per-month,
// per-day) live in the subordinate `sub` line.
const FALLBACK_PRICING: PaywallPricingCopy = {
  yearly: {
    title: "Yearly",
    sub: "just $3.33 a month",
    price: "$40.00",
    per: "/yr",
    badge: "SAVE 63%",
  },
  monthly: {
    title: "Monthly",
    sub: "billed monthly",
    price: "$9.00",
    per: "/mo",
  },
  footer: {
    yearly: "$40/yr ($3.33/mo). Cancel anytime · Terms & Privacy",
    monthly: "$9/mo. Cancel anytime · Terms & Privacy",
  },
};

function priceString(pkg: PricePackage | null | undefined, fallback: string): string {
  const value = pkg?.product.priceString;
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function numericPrice(pkg: PricePackage | null | undefined): number | null {
  const value = pkg?.product.price;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function currencyCode(pkg: PricePackage | null | undefined): string {
  const value = pkg?.product.currencyCode;
  return typeof value === "string" && value.trim().length > 0 ? value : "USD";
}

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
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
): PaywallPricingCopy {
  if (!packages) return FALLBACK_PRICING;

  const monthly = packages.monthly;
  const yearly = packages.yearly;
  const monthlyPrice = priceString(monthly, FALLBACK_PRICING.monthly.price);
  const annualPrice = priceString(yearly, "$40.00");
  const annualAmount = numericPrice(yearly);
  const monthlyEquivalent = annualAmount
    ? formatCurrency(annualAmount / 12, currencyCode(yearly))
    : FALLBACK_PRICING.yearly.price;

  return {
    yearly: {
      title: "Yearly",
      sub: `just ${monthlyEquivalent} a month`,
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
      yearly: `${annualPrice}/yr (${monthlyEquivalent}/mo). Cancel anytime · Terms & Privacy`,
      monthly: `${monthlyPrice}/mo. Cancel anytime · Terms & Privacy`,
    },
  };
}
