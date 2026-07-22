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

// App Review guideline 3.1.2(c): the BILLED amount must be the clear price.
// Do not market the annual plan using a calculated monthly equivalent.
const FALLBACK_PRICING: PaywallPricingCopy = {
  yearly: {
    title: "Yearly",
    sub: "billed yearly",
    price: "$40.00",
    per: "/yr",
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
};

function priceString(pkg: PricePackage | null | undefined, fallback: string): string {
  const value = pkg?.product.priceString;
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function numericPrice(pkg: PricePackage | null | undefined): number | null {
  const value = pkg?.product.price;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

  return {
    yearly: {
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
  };
}
