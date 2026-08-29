// Metadata-driven paywall treatment, so a price experiment is a RevenueCat
// config change rather than a build.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: the paywall never branches on a price
// VALUE. There is no `if (price === 4.99)` anywhere, and there must never be.
// Every visual difference between arms comes from the Offering's metadata, so
// arm C next month is somebody typing two keys into a dashboard.
//
// FLAT KEYS, NOT NESTED JSON. These are typed by hand into RevenueCat's
// metadata editor, and a mismatched key fails SILENTLY — the paywall simply
// renders unstyled and the experiment looks like it did nothing. Two flat
// string keys is the smallest surface that can go wrong.
//
// PRESENCE IS THE FLAG. There is deliberately no `show_comparison` boolean:
// a third key is a third thing to typo, and it can contradict the other two
// (show_comparison=true with no compare_to_product is undefined behaviour).
// A comparison is shown when a comparison product is named and resolves.
//
// EVERYTHING IS OPTIONAL AND EVERYTHING FAILS SAFE. Missing metadata, wrong
// types, a malformed blob, a product that does not resolve — every one of
// those renders the standard paywall at the real price. A broken paywall is
// worse than an unstyled one.

/** The exact keys typed into RevenueCat. Changing these breaks live arms. */
export const METADATA_KEYS = {
  /** Short badge over the plan card, e.g. "50% OFF". */
  badge: 'discount_badge',
  /**
   * Product identifier whose localized price is struck through above the real
   * one. NOT a price — the number must come from StoreKit so a German user
   * sees euros.
   */
  compareTo: 'compare_to_product',
} as const;

/**
 * A badge longer than this is a layout bug, not a badge. Capped rather than
 * rejected: a too-long string is a typo in the dashboard, and silently
 * dropping the whole treatment over it is worse than truncating.
 */
export const MAX_BADGE_LENGTH = 16;

export interface PaywallTreatment {
  /** Badge text, or null for no badge. */
  badge: string | null;
  /** Product identifier to strike through, or null for none. */
  compareToProductId: string | null;
}

export const NO_TREATMENT: PaywallTreatment = { badge: null, compareToProductId: null };

function readString(source: Record<string, unknown>, key: string): string | null {
  const raw = source[key];
  // Numbers and booleans are NOT coerced. A metadata value of `50` for a badge
  // is a mistake in the dashboard, and rendering "50" is a worse outcome than
  // rendering no badge — the second is visibly missing, the first looks fine.
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Read the treatment off an Offering's metadata.
 *
 * NEVER THROWS. `metadata` is typed `{ [k: string]: unknown }` by the SDK and
 * is whatever somebody typed into a web form, so this treats it as untrusted
 * input rather than as a contract.
 */
export function readPaywallTreatment(metadata: unknown): PaywallTreatment {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return NO_TREATMENT;
  }
  try {
    const source = metadata as Record<string, unknown>;
    const badge = readString(source, METADATA_KEYS.badge);
    return {
      badge: badge == null ? null : badge.slice(0, MAX_BADGE_LENGTH),
      compareToProductId: readString(source, METADATA_KEYS.compareTo),
    };
  } catch {
    // A getter on the object throwing is far-fetched, but this runs on the
    // paywall and the cost of being wrong is a blank purchase screen.
    return NO_TREATMENT;
  }
}

export interface ComparisonPrice {
  /** The localized price string from StoreKit, e.g. "$9.99" or "9,99 €". */
  priceString: string;
}

interface PackageLike {
  product: { identifier?: string; priceString?: string };
}

/**
 * Resolve the struck-through price to a REAL localized price string.
 *
 * Returns null when the named product is not in the offering, or carries no
 * price string. The caller renders no strikethrough in that case — never a
 * hardcoded number, because a wrong struck-through price is a false discount
 * claim rather than a cosmetic slip.
 */
export function resolveComparisonPrice(
  treatment: PaywallTreatment,
  packages: readonly PackageLike[] | null | undefined,
): ComparisonPrice | null {
  if (!treatment.compareToProductId || !packages) return null;
  for (const pkg of packages) {
    if (pkg?.product?.identifier !== treatment.compareToProductId) continue;
    const priceString = pkg.product.priceString;
    if (typeof priceString !== 'string' || priceString.length === 0) return null;
    return { priceString };
  }
  return null;
}

/**
 * Event properties naming the arm, for our own analytics.
 *
 * RevenueCat tracks the experiment on its side; this puts it in PostHog so a
 * funnel can be cut by arm without leaving the tool. EVENT properties only —
 * the person allowlist stays exactly ["platform"].
 */
export function experimentProperties(offering: unknown): Record<string, string> {
  if (offering == null || typeof offering !== 'object') return {};
  const source = offering as Record<string, unknown>;
  const out: Record<string, string> = {};
  const identifier = source.identifier;
  if (typeof identifier === 'string' && identifier.length > 0) {
    out.offering_id = identifier;
  }
  // RevenueCat attaches these to the offering when it is served as part of an
  // experiment. Both are absent outside one, which is why they are optional
  // rather than defaulted — an empty string would look like a real arm.
  for (const [key, prop] of [
    ['experimentId', 'experiment_id'],
    ['experimentVariant', 'experiment_variant'],
  ] as const) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0) out[prop] = value;
    else if (typeof value === 'number') out[prop] = String(value);
  }
  return out;
}
