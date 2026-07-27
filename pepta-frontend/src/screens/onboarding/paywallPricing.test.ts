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
  it("anchors the yearly card on the per-month equivalent with the billed total beneath", () => {
    const pricing = buildPaywallPricing({
      monthly: packageWithPrice("$9.99", 9.99),
      yearly: packageWithPrice("$39.99", 39.99),
    });

    expect(pricing.monthly.price).toBe("$9.99");
    // $39.99 / 12 — the bold anchor; the billed total rides underneath.
    expect(pricing.yearly.price).toBe("$3.33");
    expect(pricing.yearly.per).toBe("/mo");
    expect(pricing.yearly.priceNote).toBe("$39.99/yr");
    expect(pricing.yearly.sub).toBe("billed yearly");
    expect(pricing.yearly.badge).toBe("SAVE 67%");
    // 3.1.2(c): the billed amount stays explicit in the footer too.
    expect(pricing.footer.yearly).toBe(
      "$39.99/year. Cancel anytime · Terms & Privacy",
    );
    expect(pricing.footer.monthly).toBe(
      "$9.99/month. Cancel anytime · Terms & Privacy",
    );
    expect(pricing.footer.yearly.toLowerCase()).not.toContain("/mo");
    expect(pricing.footer.yearly.toLowerCase()).not.toContain("free");
    expect(pricing.footer.monthly.toLowerCase()).not.toContain("trial");
  });

  it("keeps the billed price bold when the currency symbol can't lead the anchor", () => {
    const pricing = buildPaywallPricing({
      monthly: packageWithPrice("9,99 €", 9.99, "EUR"),
      yearly: packageWithPrice("39,99 €", 39.99, "EUR"),
    });

    // Suffix-formatted currency → no faithful "/mo" string → billed layout.
    expect(pricing.yearly.price).toBe("39,99 €");
    expect(pricing.yearly.per).toBe("/yr");
    expect(pricing.yearly.priceNote).toBeUndefined();
  });

  it("falls back to design pricing until RevenueCat packages load", () => {
    const pricing = buildPaywallPricing(null);

    expect(pricing.monthly.price).toBe("$9.99");
    expect(pricing.yearly.price).toBe("$3.33");
    expect(pricing.yearly.per).toBe("/mo");
    expect(pricing.yearly.priceNote).toBe("$40.00/yr");
    expect(pricing.yearly.sub).toBe("billed yearly");
    // $9.99 × 12 = $119.88 → $40/yr saves 67% (matches the computed path).
    expect(pricing.yearly.badge).toBe("SAVE 67%");
    expect(pricing.footer.yearly).toBe(
      "$40.00/year. Cancel anytime · Terms & Privacy",
    );
    expect(pricing.footer.monthly).toBe(
      "$9.99/month. Cancel anytime · Terms & Privacy",
    );
    expect(pricing.footer.yearly.toLowerCase()).not.toContain("/mo");
    expect(pricing.footer.yearly.toLowerCase()).not.toContain("free");
    expect(pricing.footer.monthly.toLowerCase()).not.toContain("trial");
  });

  // Experiment arms: copy is DERIVED from the product's intro offer.
  it("derives the trial CTA from a zero-price intro offer (treatment arm)", () => {
    const pricing = buildPaywallPricing({
      monthly: {
        product: {
          price: 9.99,
          priceString: "$9.99",
          currencyCode: "USD",
          introPrice: { price: 0, periodNumberOfUnits: 3, periodUnit: "DAY" },
        },
      },
      yearly: packageWithPrice("$40.00", 40),
    });

    expect(pricing.cta.monthly.label).toBe("Start 3-day free trial");
    expect(pricing.cta.monthly.subline).toBe(
      "Then $9.99/mo. Auto-renews. Cancel anytime in Settings.",
    );
    // The annual plan is identical on both arms.
    expect(pricing.cta.yearly).toEqual({ label: "Subscribe" });
  });

  it("reads the trial duration from the product, not a literal", () => {
    const pricing = buildPaywallPricing({
      monthly: {
        product: {
          price: 4.99,
          priceString: "$4.99",
          introPrice: { price: 0, periodNumberOfUnits: 1, periodUnit: "WEEK" },
        },
      },
      yearly: packageWithPrice("$40.00", 40),
    });

    expect(pricing.cta.monthly.label).toBe("Start 1-week free trial");
    expect(pricing.cta.monthly.subline).toBe(
      "Then $4.99/mo. Auto-renews. Cancel anytime in Settings.",
    );
  });

  it("shows no trial copy on the control arm or for paid intro offers", () => {
    const control = buildPaywallPricing({
      monthly: packageWithPrice("$9.99", 9.99),
      yearly: packageWithPrice("$40.00", 40),
    });
    expect(control.cta.monthly).toEqual({ label: "Subscribe" });

    const paidIntro = buildPaywallPricing({
      monthly: {
        product: {
          price: 9.99,
          priceString: "$9.99",
          introPrice: { price: 4.99, periodNumberOfUnits: 1, periodUnit: "MONTH" },
        },
      },
      yearly: packageWithPrice("$40.00", 40),
    });
    expect(paidIntro.cta.monthly).toEqual({ label: "Subscribe" });
  });

  it("never advertises a trial before packages load", () => {
    expect(buildPaywallPricing(null).cta.monthly).toEqual({ label: "Subscribe" });
  });
});
