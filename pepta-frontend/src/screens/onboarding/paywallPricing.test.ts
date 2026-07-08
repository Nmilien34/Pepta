import { describe, expect, it } from "vitest";
import { buildPaywallPricing } from "./paywallPricing";

function packageWithPrice(priceString: string, price: number, currencyCode = "USD") {
  return {
    product: {
      price,
      priceString,
      currencyCode,
    },
  };
}

describe("buildPaywallPricing", () => {
  it("uses RevenueCat product prices for plan cards and footer copy", () => {
    const pricing = buildPaywallPricing({
      monthly: packageWithPrice("$9.99", 9.99),
      yearly: packageWithPrice("$39.99", 39.99),
    });

    expect(pricing.monthly.price).toBe("$9.99");
    // Guideline 3.1.2(c): the BILLED amount is the conspicuous price element;
    // the per-month equivalent lives in the subordinate sub line.
    expect(pricing.yearly.price).toBe("$39.99");
    expect(pricing.yearly.per).toBe("/yr");
    expect(pricing.yearly.sub).toBe("just $3.33 a month");
    expect(pricing.yearly.badge).toBe("SAVE 67%");
    expect(pricing.footer.yearly).toBe(
      "$39.99/yr ($3.33/mo). Cancel anytime · Terms & Privacy",
    );
    expect(pricing.footer.monthly).toBe(
      "$9.99/mo. Cancel anytime · Terms & Privacy",
    );
    expect(pricing.footer.yearly.toLowerCase()).not.toContain("free");
    expect(pricing.footer.monthly.toLowerCase()).not.toContain("trial");
  });

  it("falls back to design pricing until RevenueCat packages load", () => {
    const pricing = buildPaywallPricing(null);

    expect(pricing.monthly.price).toBe("$9.00");
    expect(pricing.yearly.price).toBe("$40.00");
    expect(pricing.yearly.per).toBe("/yr");
    expect(pricing.yearly.sub).toBe("just $3.33 a month");
    expect(pricing.yearly.badge).toBe("SAVE 63%");
    expect(pricing.footer.yearly).toBe(
      "$40/yr ($3.33/mo). Cancel anytime · Terms & Privacy",
    );
    expect(pricing.footer.monthly).toBe(
      "$9/mo. Cancel anytime · Terms & Privacy",
    );
    expect(pricing.footer.yearly.toLowerCase()).not.toContain("free");
    expect(pricing.footer.monthly.toLowerCase()).not.toContain("trial");
  });
});
