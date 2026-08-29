// Metadata-driven paywall treatment.
//
// The whole point is that the paywall never branches on a price VALUE, so
// these tests never assert on a number being 4.99 or 9.99 either — they assert
// that whatever StoreKit returns is what gets rendered.
//
// Every failure mode here is SILENT in production: a mistyped key, a number
// where a string was expected, a comparison product that is not in the
// offering. None of them throw, all of them degrade to the standard paywall,
// and none of them are visible without a test.
import { describe, expect, it } from 'vitest';
import {
  MAX_BADGE_LENGTH,
  METADATA_KEYS,
  NO_TREATMENT,
  experimentProperties,
  readPaywallTreatment,
  resolveComparisonPrice,
} from './paywallExperiment';

const pkg = (identifier: string, priceString: string) => ({ product: { identifier, priceString } });

const ARM_B = {
  [METADATA_KEYS.badge]: '50% OFF',
  [METADATA_KEYS.compareTo]: 'pepta_monthly_999',
};

describe('reading the treatment', () => {
  it('arm A: no metadata means no treatment', () => {
    expect(readPaywallTreatment(undefined)).toEqual(NO_TREATMENT);
    expect(readPaywallTreatment({})).toEqual(NO_TREATMENT);
  });

  it('arm B: badge and comparison product', () => {
    expect(readPaywallTreatment(ARM_B)).toEqual({
      badge: '50% OFF',
      compareToProductId: 'pepta_monthly_999',
    });
  });

  it('does not crash on a malformed blob', () => {
    for (const junk of [null, 'a string', 42, [], [1, 2], true, NaN]) {
      expect(() => readPaywallTreatment(junk)).not.toThrow();
      expect(readPaywallTreatment(junk)).toEqual(NO_TREATMENT);
    }
  });

  it('ignores non-string values rather than coercing them', () => {
    // A badge of `50` is a dashboard typo. Rendering "50" looks intentional;
    // rendering nothing is visibly missing, which is the outcome we want.
    const t = readPaywallTreatment({ [METADATA_KEYS.badge]: 50, [METADATA_KEYS.compareTo]: true });
    expect(t).toEqual(NO_TREATMENT);
  });

  it('treats whitespace as absent', () => {
    expect(readPaywallTreatment({ [METADATA_KEYS.badge]: '   ' }).badge).toBeNull();
  });

  it('caps an over-long badge instead of dropping the treatment', () => {
    const t = readPaywallTreatment({ [METADATA_KEYS.badge]: 'x'.repeat(200) });
    expect(t.badge).toHaveLength(MAX_BADGE_LENGTH);
  });

  it('ignores a mistyped key, which is the likeliest dashboard error', () => {
    expect(readPaywallTreatment({ discountBadge: '50% OFF' })).toEqual(NO_TREATMENT);
  });
});

describe('the struck-through price is a real localized price', () => {
  const packages = [pkg('pepta_monthly_999', '9,99 €'), pkg('pepta_monthly_499', '4,99 €')];

  it('resolves the comparison product through StoreKit', () => {
    // Euros, not dollars: the whole reason this is resolved rather than
    // written into metadata as a literal.
    expect(resolveComparisonPrice(readPaywallTreatment(ARM_B), packages)).toEqual({
      priceString: '9,99 €',
    });
  });

  it('degrades to NO strikethrough when the product is not in the offering', () => {
    const t = readPaywallTreatment({ [METADATA_KEYS.compareTo]: 'pepta_monthly_nope' });
    expect(resolveComparisonPrice(t, packages)).toBeNull();
  });

  it('degrades when the resolved product carries no price string', () => {
    const broken = [{ product: { identifier: 'pepta_monthly_999' } }];
    expect(resolveComparisonPrice(readPaywallTreatment(ARM_B), broken)).toBeNull();
  });

  it('degrades when packages have not loaded', () => {
    expect(resolveComparisonPrice(readPaywallTreatment(ARM_B), null)).toBeNull();
    expect(resolveComparisonPrice(readPaywallTreatment(ARM_B), [])).toBeNull();
  });

  it('shows nothing when no comparison was asked for', () => {
    expect(resolveComparisonPrice(NO_TREATMENT, packages)).toBeNull();
  });
});

describe('naming the arm in our own analytics', () => {
  it('carries the offering and the experiment ids', () => {
    expect(
      experimentProperties({
        identifier: 'price_test_b',
        experimentId: 'exp_123',
        experimentVariant: 'b',
      }),
    ).toEqual({
      offering_id: 'price_test_b',
      experiment_id: 'exp_123',
      experiment_variant: 'b',
    });
  });

  it('omits experiment ids outside an experiment rather than sending empties', () => {
    // An empty string here would look like a real arm in a PostHog breakdown.
    expect(experimentProperties({ identifier: 'default' })).toEqual({ offering_id: 'default' });
  });

  it('accepts a numeric variant, which RevenueCat has been known to send', () => {
    const props = experimentProperties({ identifier: 'o', experimentVariant: 1 });
    expect(props.experiment_variant).toBe('1');
  });

  it('never throws on a missing or malformed offering', () => {
    for (const junk of [null, undefined, 'x', 7]) {
      expect(() => experimentProperties(junk)).not.toThrow();
      expect(experimentProperties(junk)).toEqual({});
    }
  });
});
