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
    // round(66.64) — conventional rounding, per Nick (49 "reads weaker").
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
    expect(pricing.yearly.price).toBe("$5.00");
    expect(pricing.yearly.per).toBe("/mo");
    expect(pricing.yearly.priceNote).toBe("$59.99/yr");
    expect(pricing.yearly.sub).toBe("billed yearly");
    // Last-resort constants, aligned to the Aug 5 2026 US list prices.
    expect(pricing.yearly.badge).toBe("SAVE 50%");
    expect(pricing.footer.yearly).toBe(
      "$59.99/year. Cancel anytime · Terms & Privacy",
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
    }, { monthly: true, yearly: false });

    // "$0.00" rather than "free" — a concrete number reads as a real price.
    // The duration deliberately does NOT live on the button (it moved to the
    // timeline + subline); the trial-ness of the CTA is the $0.00.
    expect(pricing.cta.monthly.label).toBe("Try today for $0.00");
    // Duration, price after, auto-renewal: all three are required near the
    // CTA. The reminder promise is kept by trialReminder.ts — if that is ever
    // unwired, this sentence has to come out with it.
    expect(pricing.cta.monthly.subline).toBe(
      "3 days free — we'll remind you before it ends. Then $9.99/mo, auto-renews. Cancel anytime in Settings.",
    );
    // The annual plan is identical on both arms.
    expect(pricing.cta.yearly).toEqual({ label: "Start my year — $40.00" });
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
    }, { monthly: true, yearly: false });

    expect(pricing.cta.monthly.label).toBe("Try today for $0.00");
    expect(pricing.cta.monthly.subline).toContain("1 week free");
    expect(pricing.cta.monthly.subline).toContain("Then $4.99/mo, auto-renews.");
  });

  it("shows no trial copy on the control arm or for paid intro offers", () => {
    const control = buildPaywallPricing({
      monthly: packageWithPrice("$9.99", 9.99),
      yearly: packageWithPrice("$40.00", 40),
    });
    expect(control.cta.monthly).toEqual({ label: "Start my month — $9.99" });

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
    expect(paidIntro.cta.monthly).toEqual({ label: "Start my month — $9.99" });
  });

  it("never advertises a trial before packages load", () => {
    expect(buildPaywallPricing(null).cta.monthly).toEqual({ label: "Start my month — $9.99" });
  });

  it("makes no $0.00 claim to a user who is not eligible for the intro offer", () => {
    // THE POINT OF THE ELIGIBILITY FLAG. The product carries a trial, but this
    // user already used one in this subscription group, so StoreKit will
    // charge full price immediately. Advertising "$0.00" would be a false
    // price claim on the paywall. Default is ineligible, so an unresolved
    // check fails the same safe way.
    const withTrial = {
      monthly: {
        product: {
          price: 9.99,
          priceString: "$9.99",
          introPrice: { price: 0, periodNumberOfUnits: 3, periodUnit: "DAY" },
        },
      },
      yearly: packageWithPrice("$40.00", 40),
    };

    for (const pricing of [buildPaywallPricing(withTrial, { monthly: false, yearly: false }), buildPaywallPricing(withTrial)]) {
      expect(pricing.cta.monthly).toEqual({ label: "Start my month — $9.99" });
      expect(JSON.stringify(pricing)).not.toContain("$0.00");
    }
  });

  it("puts the trial badge on the monthly ROW, derived from the product, only when permitted", () => {
    // The visibility fix: yearly is preselected in both arms, so without a
    // row badge variant-B users only saw trial copy after tapping monthly.
    const withTrial = {
      monthly: {
        product: {
          price: 9.99,
          priceString: "$9.99",
          introPrice: { price: 0, periodNumberOfUnits: 3, periodUnit: "DAY" },
        },
      },
      yearly: packageWithPrice("$40.00", 40),
    };
    expect(buildPaywallPricing(withTrial, { monthly: true, yearly: false }).monthly.badge).toBe("3 days free");
    // Control arm / no intro: no badge — the arms differ only in the trial.
    expect(buildPaywallPricing(withTrial, { monthly: false, yearly: false }).monthly.badge).toBeUndefined();
    expect(
      buildPaywallPricing(
        { monthly: packageWithPrice("$9.99", 9.99), yearly: packageWithPrice("$40.00", 40) },
        { monthly: true, yearly: true },
      ).monthly.badge,
    ).toBeUndefined();
  });

  // The package-agnostic contract: every combination of intro offers renders
  // correctly with zero code awareness of WHICH product carries the trial.
  describe("per-plan trial matrix", () => {
    const trialPkg = (price: string, amount: number, units: number, unit: string) => ({
      product: {
        price: amount,
        priceString: price,
        introPrice: { price: 0, periodNumberOfUnits: units, periodUnit: unit },
      },
    });

    it("trial on BOTH plans: both CTAs free, yearly badge = trial with SAVE relocated to its sub-line", () => {
      const pricing = buildPaywallPricing(
        { monthly: trialPkg("$9.99", 9.99, 3, "DAY"), yearly: trialPkg("$40.00", 40, 3, "DAY") },
        { monthly: true, yearly: true },
      );
      expect(pricing.cta.yearly.label).toBe("Try today for $0.00");
      expect(pricing.cta.monthly.label).toBe("Try today for $0.00");
      // Yearly's post-trial price is the YEARLY price — never monthly leaking.
      expect(pricing.cta.yearly.subline).toBe(
        "3 days free — we'll remind you before it ends. Then $40.00/yr, auto-renews. Cancel anytime in Settings.",
      );
      // Badge collision resolution: trial claims the slot, SAVE moves to sub.
      expect(pricing.yearly.badge).toBe("3 days free");
      expect(pricing.yearly.badgeTone).toBe("trial");
      expect(pricing.yearly.sub).toBe("billed yearly · save 67%");
      // Badge priority: yearly's eligible trial wins the badge; two identical
      // badges cancel each other out. Monthly's trial stays live and fully
      // disclosed — its CTA above proves it — the BADGE is what moves.
      expect(pricing.monthly.badge).toBeUndefined();
    });

    it("trial on MONTHLY only (today's live state): exact pre-change rendering", () => {
      const pricing = buildPaywallPricing(
        { monthly: trialPkg("$9.99", 9.99, 3, "DAY"), yearly: packageWithPrice("$40.00", 40) },
        { monthly: true, yearly: false },
      );
      expect(pricing.yearly.badge).toBe("SAVE 67%");
      expect(pricing.yearly.badgeTone).toBe("save");
      expect(pricing.yearly.sub).toBe("billed yearly");
      expect(pricing.monthly.badge).toBe("3 days free");
      expect(pricing.cta.yearly.label).toBe("Start my year — $40.00");
      expect(pricing.cta.monthly.label).toBe("Try today for $0.00");
    });

    it("trial on ANNUAL only: yearly free, monthly honest purchase", () => {
      const pricing = buildPaywallPricing(
        { monthly: packageWithPrice("$9.99", 9.99), yearly: trialPkg("$40.00", 40, 3, "DAY") },
        { monthly: false, yearly: true },
      );
      expect(pricing.cta.yearly.label).toBe("Try today for $0.00");
      expect(pricing.cta.monthly.label).toBe("Start my month — $9.99");
      expect(pricing.yearly.badge).toBe("3 days free");
      expect(pricing.monthly.badge).toBeUndefined();
    });

    it("trial on NEITHER: purchase CTAs, SAVE badge back in yearly's slot", () => {
      const pricing = buildPaywallPricing(
        { monthly: packageWithPrice("$9.99", 9.99), yearly: packageWithPrice("$40.00", 40) },
        { monthly: false, yearly: false },
      );
      expect(pricing.yearly.badge).toBe("SAVE 67%");
      expect(pricing.monthly.badge).toBeUndefined();
      expect(JSON.stringify(pricing)).not.toContain("$0.00");
    });

    it("an ineligible user sees no trial copy even when both products carry intros", () => {
      const pricing = buildPaywallPricing(
        { monthly: trialPkg("$9.99", 9.99, 3, "DAY"), yearly: trialPkg("$40.00", 40, 3, "DAY") },
        { monthly: false, yearly: false },
      );
      expect(JSON.stringify(pricing)).not.toContain("$0.00");
      expect(pricing.yearly.badge).toBe("SAVE 67%");
    });

    it("differing durations: each plan derives from its OWN intro offer", () => {
      const pricing = buildPaywallPricing(
        { monthly: trialPkg("$9.99", 9.99, 3, "DAY"), yearly: trialPkg("$40.00", 40, 1, "WEEK") },
        { monthly: true, yearly: true },
      );
      expect(pricing.yearly.badge).toBe("1 week free");
      expect(pricing.yearly.sub).toBe("billed yearly · save 67%");
      expect(pricing.cta.yearly.subline).toContain("1 week free");
      // yearly's badge suppresses monthly's, but monthly's CTA still
      // discloses ITS OWN trial — display choice, not disclosure choice.
      expect(pricing.monthly.badge).toBeUndefined();
      expect(pricing.cta.monthly.subline).toContain("3 days free");
    });
  });

  it("rounds the saving conventionally, live at the Aug 5 prices", () => {
    // $59.99/yr vs $9.99×12 = a true 49.96% saving → "SAVE 50%" (deliberate:
    // conventional rounding beats a technically-purer 49, per Nick).
    const pricing = buildPaywallPricing({
      monthly: packageWithPrice("$9.99", 9.99),
      yearly: packageWithPrice("$59.99", 59.99),
    });
    expect(pricing.yearly.badge).toBe("SAVE 50%");
    expect(pricing.yearly.price).toBe("$5.00");
    expect(pricing.yearly.priceNote).toBe("$59.99/yr");
    expect(pricing.cta.yearly.label).toBe("Start my year — $59.99");
    // An exact saving stays exact.
    const exact = buildPaywallPricing({
      monthly: packageWithPrice("$10.00", 10),
      yearly: packageWithPrice("$60.00", 60),
    });
    expect(exact.yearly.badge).toBe("SAVE 50%");
    // A loaded product with no numeric price gets NO badge — never a stale claim.
    const broken = buildPaywallPricing({
      monthly: { product: { priceString: "$9.99" } },
      yearly: packageWithPrice("$59.99", 59.99),
    });
    expect(broken.yearly.badge).toBeUndefined();
  });

  it("badge priority: exactly one row wears a badge in every eligibility case", () => {
    const trialPkg = (price: string, amount: number) => ({
      product: {
        price: amount,
        priceString: price,
        introPrice: { price: 0, periodNumberOfUnits: 3, periodUnit: "DAY" },
      },
    });
    const both = { monthly: trialPkg("$9.99", 9.99), yearly: trialPkg("$59.99", 59.99) };

    // 1. Yearly eligible → yearly wears the trial badge, monthly none.
    const caseOne = buildPaywallPricing(both, { monthly: true, yearly: true });
    expect(caseOne.yearly.badge).toBe("3 days free");
    expect(caseOne.monthly.badge).toBeUndefined();

    // 2. Yearly ineligible (consumed the annual intro), monthly eligible →
    //    the badge moves to monthly; yearly reverts to its SAVE badge. This
    //    is the user Screen A promised "free" — the wall must show where
    //    free lives.
    const caseTwo = buildPaywallPricing(both, { monthly: true, yearly: false });
    expect(caseTwo.monthly.badge).toBe("3 days free");
    expect(caseTwo.yearly.badge).toBe("SAVE 50%");
    expect(caseTwo.yearly.badgeTone).toBe("save");

    // 3. Neither eligible → SAVE badge only, no trial badge anywhere.
    const caseThree = buildPaywallPricing(both, { monthly: false, yearly: false });
    expect(caseThree.yearly.badge).toBe("SAVE 50%");
    expect(caseThree.monthly.badge).toBeUndefined();
    expect(JSON.stringify(caseThree)).not.toContain("$0.00");
  });
});
