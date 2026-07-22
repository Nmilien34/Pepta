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
    expect(pricing.yearly.price).toBe("$39.99");
    expect(pricing.yearly.per).toBe("/yr");
    expect(pricing.yearly.sub).toBe("billed yearly");
    expect(pricing.yearly.badge).toBe("SAVE 67%");
    expect(pricing.footer.yearly).toBe(
      "$39.99/year. Cancel anytime · Terms & Privacy",
    );
    expect(pricing.footer.monthly).toBe(
      "$9.99/month. Cancel anytime · Terms & Privacy",
    );
    expect(pricing.yearly.sub.toLowerCase()).not.toContain("month");
    expect(pricing.footer.yearly.toLowerCase()).not.toContain("/mo");
    expect(pricing.footer.yearly.toLowerCase()).not.toContain("free");
    expect(pricing.footer.monthly.toLowerCase()).not.toContain("trial");
  });

  it("falls back to design pricing until RevenueCat packages load", () => {
    const pricing = buildPaywallPricing(null);

    expect(pricing.monthly.price).toBe("$9.99");
    expect(pricing.yearly.price).toBe("$40.00");
    expect(pricing.yearly.per).toBe("/yr");
    expect(pricing.yearly.sub).toBe("billed yearly");
    // $9.99 × 12 = $119.88 → $40/yr saves 67% (matches the computed path).
    expect(pricing.yearly.badge).toBe("SAVE 67%");
    expect(pricing.footer.yearly).toBe(
      "$40.00/year. Cancel anytime · Terms & Privacy",
    );
    expect(pricing.footer.monthly).toBe(
      "$9.99/month. Cancel anytime · Terms & Privacy",
    );
    expect(pricing.yearly.sub.toLowerCase()).not.toContain("month");
    expect(pricing.footer.yearly.toLowerCase()).not.toContain("/mo");
    expect(pricing.footer.yearly.toLowerCase()).not.toContain("free");
    expect(pricing.footer.monthly.toLowerCase()).not.toContain("trial");
  });
});
