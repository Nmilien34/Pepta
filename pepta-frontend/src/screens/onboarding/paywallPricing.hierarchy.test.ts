// App Review 3.1.2(c), rejection of 2026-08-28:
// "The auto-renewable subscription displays the monthly calculated pricing for
//  the subscription more clearly and conspicuously than the billed amount."
//
// The plan card renders `price` at fontSize 19 in the statMedium variant and
// `priceNote` at fontSize 10 in textTertiary. For the yearly plan those held
// the CALCULATED per-month figure and the BILLED annual amount respectively —
// inverted on every factor Apple names: size, colour and location.
//
// These tests pin the hierarchy at the data layer, where it is decided. The
// styling is fixed; which STRING lands in the dominant slot is the bug.
import { describe, expect, it } from 'vitest';
import { buildPaywallPricing } from './paywallPricing';

const pkg = (priceString: string, price: number) => ({
  product: { priceString, price },
}) as never;

const PACKAGES = { monthly: pkg('$9.99', 9.99), yearly: pkg('$59.99', 59.99) };

describe('the billed amount outranks the calculated one', () => {
  it('puts the annual BILLED price in the dominant slot', () => {
    const copy = buildPaywallPricing(PACKAGES as never, undefined as never);
    // `price` is the 19pt statMedium element.
    expect(copy.yearly.price).toContain('59.99');
    expect(copy.yearly.per).toBe('/yr');
  });

  it('demotes the per-month figure to the note, phrased as an equivalence', () => {
    const copy = buildPaywallPricing(PACKAGES as never, undefined as never);
    // `priceNote` is the 10pt textTertiary element.
    expect(copy.yearly.priceNote ?? '').toContain('4.99');
    expect(copy.yearly.priceNote ?? '').toMatch(/mo/);
    // Read as an equivalence, never as the price itself.
    expect(copy.yearly.priceNote ?? '').toMatch(/^≈|about|=/i);
  });

  it('never shows the calculated figure larger than the billed one', () => {
    const copy = buildPaywallPricing(PACKAGES as never, undefined as never);
    // The dominant slot must not be the derived number.
    expect(copy.yearly.price).not.toContain('4.99');
  });

  it('leaves monthly alone — its price IS the billed amount', () => {
    const copy = buildPaywallPricing(PACKAGES as never, undefined as never);
    expect(copy.monthly.price).toContain('9.99');
    expect(copy.monthly.per).toBe('/mo');
    expect(copy.monthly.priceNote).toBeUndefined();
  });

  it('keeps the CTA on the billed amount', () => {
    const copy = buildPaywallPricing(PACKAGES as never, undefined as never);
    expect(copy.cta.yearly.label).toContain('59.99');
    expect(copy.cta.yearly.label).not.toContain('4.99');
  });
});
