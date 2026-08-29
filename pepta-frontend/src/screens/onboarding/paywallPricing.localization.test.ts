// Two hardcoded US amounts on a build being resubmitted over a
// pricing-display rejection (3.1.2(c)).
//
// A reviewer on a non-US storefront seeing "$0.00" on the trial CTA is itself
// a pricing-display problem — and it is the CTA, the most prominent price on
// the screen. Same for the cent sign in the per-day anchor.
//
// Neither is cosmetic: both are silently wrong for every storefront outside
// the US, which is exactly the failure mode rule 1 of this work exists to kill.
import { describe, expect, it } from 'vitest';
import { buildPaywallPricing, dailyEquivalent } from './paywallPricing';

const euroYearly = {
  product: {
    price: 39.99,
    priceString: '39,99 €',
    currencyCode: 'EUR',
    introPrice: { price: 0, priceString: '0,00 €', periodNumberOfUnits: 3, periodUnit: 'DAY' },
  },
} as never;
const euroMonthly = {
  product: {
    price: 4.99,
    priceString: '4,99 €',
    currencyCode: 'EUR',
    introPrice: { price: 0, priceString: '0,00 €', periodNumberOfUnits: 3, periodUnit: 'DAY' },
  },
} as never;

describe('the trial CTA shows a localized zero', () => {
  it('never says $0.00 on a euro storefront', () => {
    const copy = buildPaywallPricing(
      { monthly: euroMonthly, yearly: euroYearly },
      { monthly: true, yearly: true } as never,
    );
    expect(copy.cta.yearly.label).toContain('0,00 €');
    expect(copy.cta.yearly.label).not.toContain('$');
  });

  it('still reads naturally on a dollar storefront', () => {
    const usd = (priceString: string, price: number) => ({
      product: {
        price,
        priceString,
        currencyCode: 'USD',
        introPrice: { price: 0, priceString: '$0.00', periodNumberOfUnits: 3, periodUnit: 'DAY' },
      },
    }) as never;
    const copy = buildPaywallPricing(
      { monthly: usd('$9.99', 9.99), yearly: usd('$59.99', 59.99) },
      { monthly: true, yearly: true } as never,
    );
    expect(copy.cta.yearly.label).toContain('$0.00');
  });
});

describe('the per-day anchor uses the storefront currency', () => {
  it('never renders a cent sign for a non-USD price', () => {
    // £39.99 / 365 is well under a unit, which is exactly where the old code
    // reached for "¢" — a symbol that denominates nothing on a UK storefront.
    //
    // A POUND, not the euro fixture: "39,99 €" is suffix-formatted, so the
    // symbol match returns nothing and dailyEquivalent bails to null. Asserting
    // "no ¢" against null would pass whether or not the bug were fixed — the
    // vacuous-assertion trap. The pound has a LEADING symbol, so it reaches the
    // sub-unit branch and the assertion has something real to check.
    const gbpYearly = { product: { price: 39.99, priceString: '£39.99' } } as never;
    expect(dailyEquivalent(gbpYearly)).toBe('£0.10');
  });

  it('renders nothing at all when the symbol cannot be read', () => {
    // Suffix currencies: no faithful format is possible, so the card drops the
    // per-day anchor rather than inventing one. Same contract as
    // monthlyEquivalent — silence over a wrong number.
    expect(dailyEquivalent(euroYearly)).toBeNull();
  });

  it('keeps cents for a dollar storefront, where they are correct', () => {
    const usdYearly = { product: { price: 59.99, priceString: '$59.99' } } as never;
    expect(dailyEquivalent(usdYearly)).toContain('¢');
  });
});
