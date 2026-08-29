export interface PaywallPlanCopy {
  title: string;
  sub: string;
  price: string;
  per: string;
  badge?: string;
  /** Renders the trial badge green (fiber) so "free" never reads as "selected". */
  badgeTone?: "save" | "trial";
  /** Light line under the price — the billed total behind a per-month anchor. */
  priceNote?: string;
}

export interface PaywallCtaCopy {
  label: string;
  /** Apple-required auto-renewal disclosure when a trial is offered. */
  subline?: string;
}

export interface PaywallPricingCopy {
  monthly: PaywallPlanCopy;
  yearly: PaywallPlanCopy;
  footer: {
    monthly: string;
    yearly: string;
  };
  /** CTA per selectable plan, derived from the loaded products (trial-aware). */
  cta: {
    monthly: PaywallCtaCopy;
    yearly: PaywallCtaCopy;
  };
}

// Structural slice of react-native-purchases' intro offer. The experiment's
// treatment offering carries a free intro on the monthly product; control has
// introPrice = null. Copy is DERIVED from this — never hardcoded per arm.
interface StoreIntroPrice {
  price?: number | null;
  /**
   * The localized zero, e.g. "$0.00" or "0,00 €". Present on RevenueCat's
   * PurchasesIntroPrice; this mirror had omitted it, which is why the trial
   * CTA hardcoded dollars.
   */
  priceString?: string | null;
  periodNumberOfUnits?: number | null;
  periodUnit?: string | null;
}

interface StoreProductPrice {
  price?: number | null;
  priceString?: string | null;
  currencyCode?: string | null;
  introPrice?: StoreIntroPrice | null;
}

interface PricePackage {
  product: StoreProductPrice;
}

// Annual price framing: the BOLD number is the per-month equivalent (the
// anchor buyers compare against monthly), with the billed yearly total in
// light type directly beneath it. App Review guideline 3.1.2(c) still rules:
// the BILLED amount must stay clearly visible — it renders adjacent under the
// anchor AND in the legal footer. Never ship the /mo anchor without both (an
// earlier build was rejected over paywall pricing clarity).
// LAST-RESORT CONSTANTS — the only literal prices in the app, and they WILL
// drift from App Store Connect. They render solely while getPaywallPackages
// is unresolved (or failed): the CTA is disabled with "Loading App Store
// plans…" visible the whole time, so nothing here is purchasable copy. Keep
// aligned with ASC on every price change anyway (US list as of Aug 5 2026:
// annual $59.99, monthly $9.99), because a slow network shows this frame.
const FALLBACK_PRICING: PaywallPricingCopy = {
  yearly: {
    title: "Yearly",
    sub: "once a year",
    price: "$59.99",
    per: "/yr",
    // MUST match what monthlyEquivalent() computes for $59.99/yr, or the
    // number visibly flips when offerings land. It floors: $4.99. Subordinate
    // to the billed amount above it — see the 3.1.2(c) note in
    // buildPaywallPricing.
    priceNote: "≈ $4.99/mo",
    badge: "SAVE 50%",
  },
  monthly: {
    title: "Monthly",
    sub: "billed monthly",
    price: "$9.99",
    per: "/mo",
  },
  footer: {
    // The disclosure rides on the fallback too — this copy is on screen for
    // the moment before the store answers, and it is still a subscription
    // being offered.
    yearly: "$59.99/year, auto-renews until cancelled. Cancel anytime · Terms & Privacy",
    monthly: "$9.99/month, auto-renews until cancelled. Cancel anytime · Terms & Privacy",
  },
  // Pre-load fallback: no product yet, so never advertise a trial. (The
  // button is disabled until plans load; these labels are the disabled text.)
  cta: {
    monthly: { label: "Start my month — $9.99" },
    yearly: { label: "Start my year — $59.99" },
  },
};

/** Free trial iff the product carries a zero-price introductory offer. */
export function freeTrialOf(
  pkg: PricePackage | null | undefined,
): { periodNumberOfUnits: number; periodUnit: string; priceString?: string | null } | null {
  const intro = pkg?.product.introPrice;
  if (intro == null || intro.price !== 0) return null;
  const units = intro.periodNumberOfUnits;
  const unit = intro.periodUnit;
  if (typeof units !== "number" || units <= 0 || typeof unit !== "string") {
    return null;
  }
  // The localized zero ("$0.00", "0,00 €") straight from StoreKit. Optional
  // because the field is only meaningfully present on a real product; the CTA
  // says "free" rather than guessing a currency when it is missing.
  const priceString = typeof intro.priceString === "string" && intro.priceString.length > 0
    ? intro.priceString
    : null;
  return { periodNumberOfUnits: units, periodUnit: unit, priceString };
}

// "3 days", "1 week", … — duration comes from the product, never a literal.
// Exported for the warm-up screens ("3 days on us") so every surface derives
// the duration from the same product field.
export function trialDurationLabel(trial: { periodNumberOfUnits: number; periodUnit: string }): string {
  const unit = trial.periodUnit.toLowerCase();
  const plural = trial.periodNumberOfUnits === 1 ? unit : `${unit}s`;
  return `${trial.periodNumberOfUnits} ${plural}`;
}

/**
 * A plan row's trial badge ("3 days free"), derived from THAT package's own
 * intro offer — never hardcoded, never cross-plan. This is what keeps the
 * trial visible on first render regardless of which plan is preselected.
 * Returns undefined when the package has no zero-price intro or copy is not
 * permitted for this user.
 */
function trialBadge(pkg: PricePackage, trialEligible: boolean): string | undefined {
  const trial = freeTrialOf(pkg);
  if (!trial || !trialEligible) return undefined;
  return `${trialDurationLabel(trial)} free`;
}

/**
 * Per-plan CTA, derived from the plan's own package. ELIGIBILITY, NOT JUST
 * EXISTENCE: `introPrice` describes the product as configured; it says
 * nothing about whether THIS user can still get it. Anyone who already used
 * an intro offer in this subscription group is charged the full price
 * immediately by StoreKit, so advertising "$0.00" to them would be a false
 * price claim on the paywall. RevenueCat's own guidance for an indeterminate
 * answer is to show non-intro pricing.
 */
function planCta(
  pkg: PricePackage,
  price: string,
  perLabel: "mo" | "yr",
  planNoun: "month" | "year",
  trialEligible: boolean,
): PaywallCtaCopy {
  const trial = freeTrialOf(pkg);
  // No trial for this user: an honest purchase in arrival language, price on
  // the button.
  if (!trial || !trialEligible) return { label: `Start my ${planNoun} — ${price}` };
  return {
    // "$0.00" rather than "free": a concrete number reads as a real price the
    // user is being charged today, which converts better than the word free.
    // The duration deliberately does NOT live on the button (per Nick) — the
    // subline carries it for the Apple 3.1.2 duration disclosure.
    // LOCALIZED, never "$0.00" (2026-08-29). This is the most prominent price
    // on the paywall and it was a US-dollar literal for every storefront on
    // earth — a pricing-display defect on a build being resubmitted over a
    // pricing-display rejection. Falls back to the word "free" rather than a
    // guessed currency when StoreKit gives no intro price string.
    label: trial.priceString
      ? `Try today for ${trial.priceString}`
      : "Try today for free",
    // DELIBERATELY price-free (Nick, 2026-08-05, paywall v2 rev 5): restating
    // the annual total at reading size beside the button creates hesitance.
    // The price + auto-renewal half of the 3.1.2 trio moved to the legal
    // footer (see planFooter); revert = re-append "Then ${price}/${perLabel},
    // auto-renews. Cancel anytime in Settings." here if review pushes back.
    // The reminder promise rides along — and is kept by trialReminder.ts.
    // Unwire that and this sentence must come out too.
    subline: `${trialDurationLabel(trial)} free — we'll remind you before it ends.`,
  };
}

/**
 * Trial-aware legal footer: for a trial-eligible plan the price + renewal
 * disclosure lives HERE (tertiary, always visible) rather than in the CTA
 * subline — the demotion is deliberate (v2 rev 5), the presence is not
 * optional: with the subline price-free, this line and the plan card's
 * billed note are the 3.1.2 price/renewal surface. perLabel unused here on
 * purpose — the footer spells the unit out ("year"/"month") like v1 did.
 */
function planFooter(
  pkg: PricePackage,
  price: string,
  planNoun: 'month' | 'year',
  trialEligible: boolean,
): string {
  // AUTO-RENEWAL IS DISCLOSED FOR EVERY SUBSCRIPTION, not only when a trial
  // is on offer. App Store guideline 3.1.2 requires the auto-renewing nature
  // to be stated wherever the subscription is sold, and the trial-only branch
  // left every trial-INELIGIBLE user — anyone who already used the intro offer
  // in this group, and anyone in a no-intro arm — reading "Cancel anytime"
  // with no mention that it renews on its own.
  const trial = freeTrialOf(pkg);
  if (!trial || !trialEligible) {
    return `${price}/${planNoun}, auto-renews until cancelled. Cancel anytime · Terms & Privacy`;
  }
  return `Then ${price}/${planNoun}, auto-renews. Cancel anytime · Terms & Privacy`;
}

/**
 * The product's own localised price string, or null when it will not resolve.
 *
 * Distinct from priceString() below, which substitutes a hardcoded fallback.
 * Callers that must show a BILLED amount or nothing at all use this — a
 * guessed price on a purchase surface is a 3.1.2 problem, not a cosmetic one.
 */
export function priceStringOf(pkg: PricePackage | null | undefined): string | null {
  const raw = pkg?.product.priceString;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

function priceString(pkg: PricePackage | null | undefined, fallback: string): string {
  const value = pkg?.product.priceString;
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function numericPrice(pkg: PricePackage | null | undefined): number | null {
  const value = pkg?.product.price;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The per-month anchor from the annual product ("$4.99" from $59.99/yr) —
 * computed, never a literal, so ASC price changes need no build. Uses the numeric
 * price for math and the priceString's leading symbol for display; if the
 * currency formats with a suffix (e.g. "39,99 €") we can't format faithfully,
 * so return null and the card falls back to showing the billed price bold.
 */
function monthlyEquivalent(yearly: PricePackage): string | null {
  const amount = numericPrice(yearly);
  if (!amount || amount <= 0) return null;
  const symbol = yearly.product.priceString?.match(/^[^\d-]*/)?.[0]?.trim();
  if (!symbol) return null;
  // FLOOR, not round. $59.99/12 is 4.99916, and toFixed(2) rounded that to
  // "$5.00" — pushing the anchor over the psychological threshold the
  // per-month figure exists to stay under, and overstating what a month
  // actually costs. Flooring also guarantees the anchor never claims a price
  // lower than the yearly divided out, which is the direction that matters.
  return `${symbol}${(Math.floor(amount / 12 * 100) / 100).toFixed(2)}`;
}

/**
 * The annual price as a per-DAY figure — "16¢" from $59.99/yr.
 *
 * Same contract as monthlyEquivalent: derived from the live product, never a
 * literal, and FLOORED so the anchor can never overstate what a day costs.
 * Sub-dollar amounts render in cents because "$0.16 a day" reads as a price
 * and "16¢ a day" reads as nothing — which is the entire point of the anchor.
 *
 * 365, not 365.25: the figure is a comparison, not an invoice, and a leap-year
 * correction on a sixteen-cent number is noise pretending to be rigour.
 */
export function dailyEquivalent(yearly: PricePackage | null | undefined): string | null {
  const amount = numericPrice(yearly);
  if (!amount || amount <= 0) return null;
  const perDay = Math.floor((amount / 365) * 100) / 100;
  if (perDay <= 0) return null;
  // Symbol FIRST. The sub-dollar branch used to run before this line, so a
  // eurozone user was shown "10¢" — a symbol that denominates nothing on their
  // storefront — for a price in euros. Cents are correct only where the
  // storefront actually is dollars.
  const symbol = yearly?.product.priceString?.match(/^[^\d-]*/)?.[0]?.trim();
  if (!symbol) return null;
  if (perDay < 1 && symbol === "$") return `${Math.floor(perDay * 100)}\u00A2`;
  return `${symbol}${perDay.toFixed(2)}`;
}

function savingsBadge(monthly: PricePackage, yearly: PricePackage): string | undefined {
  const monthlyAmount = numericPrice(monthly);
  const yearlyAmount = numericPrice(yearly);
  // A loaded product without a numeric price gets NO badge — never the stale
  // fallback constant, which would be a false discount claim on live goods.
  if (!monthlyAmount || !yearlyAmount) return undefined;

  const yearlyFullPrice = monthlyAmount * 12;
  // Conventional rounding, by explicit call (Nick, 2026-08-03): $59.99 vs
  // $9.99×12 is a true 49.96% and renders "SAVE 50%" — 50 is a threshold
  // buyers recognize, 49 reads oddly precise and weaker, and the half-point
  // ceiling on the overstatement (<0.5pp) is a rounding convention any
  // reasonable reader assumes. Flip to Math.floor if that risk calculus
  // ever changes.
  const savings = Math.round((1 - yearlyAmount / yearlyFullPrice) * 100);
  return savings > 0 ? `SAVE ${savings}%` : undefined;
}

export interface PlanTrialEligibility {
  monthly: boolean;
  yearly: boolean;
}

const NO_TRIALS: PlanTrialEligibility = { monthly: false, yearly: false };

export function buildPaywallPricing(
  packages: { monthly: PricePackage; yearly: PricePackage } | null,
  /**
   * Per-plan: whether this user can actually receive that plan's intro offer.
   * Defaults to none so a caller that has not resolved eligibility yet
   * advertises no trial — the safe direction is under-promising.
   */
  trialEligible: PlanTrialEligibility = NO_TRIALS,
): PaywallPricingCopy {
  if (!packages) return FALLBACK_PRICING;

  const monthly = packages.monthly;
  const yearly = packages.yearly;
  const monthlyPrice = priceString(monthly, FALLBACK_PRICING.monthly.price);
  const annualPrice = priceString(yearly, "$59.99");

  const perMonthAnchor = monthlyEquivalent(yearly);

  // BADGE COLLISION, resolved by slot priority (2026-08-03): one badge per
  // row stays the rule — two floats collide at top-right and read as noise.
  // A row's slot goes to its OWN trial when it has one (green — the action
  // driver); yearly's SAVE badge then relocates into its support line, e.g.
  // "billed yearly · save 67%", so the discount stays visible without a
  // second float. With no yearly trial (today's live state until the ASC
  // config lands) yearly renders exactly as before: SAVE badge, plain sub.
  const yearlyTrialBadge = trialBadge(yearly, trialEligible.yearly);
  // BADGE PRIORITY (Nick, Aug 4): a badge marks ONE card as the deal — two
  // identical trial badges cancel each other out. Yearly's eligible trial
  // wins the badge and suppresses monthly's; monthly's renders only when
  // yearly is NOT eligible (the per-user case that matters: a returning
  // user who consumed the annual intro but not monthly's — Screen A promised
  // them "free", so the wall must still show where free lives). DISPLAY
  // ONLY: monthly's trial stays live, purchasable, and fully disclosed in
  // the CTA/subline; analytics report the offer, not the pixel.
  const monthlyBadge = yearlyTrialBadge ? undefined : trialBadge(monthly, trialEligible.monthly);
  const savings = savingsBadge(monthly, yearly);
  const yearlyBadge = yearlyTrialBadge ?? savings;
  // "once a year", not "billed yearly" (rev 6, 2026-08-06): user research —
  // yearly's pull is the pay-once RELIEF, not just the discount ("Paying once
  // a year as an option that is also helpful IMO instead of monthly").
  // Monthly's "billed monthly" stays flat; the contrast does the steering.
  const yearlySub =
    yearlyTrialBadge && savings
      ? `once a year · ${savings.toLowerCase()}`
      : "once a year";

  return {
    // 3.1.2(c), rejected 2026-08-28. This used to put perMonthAnchor in
    // `price` (19pt statMedium) and the annual total in `priceNote` (10pt
    // textTertiary) — the CALCULATED figure outranking the BILLED one on
    // every factor Apple names: size, colour and location. Swapped. The
    // per-month number survives only as a subordinate equivalence, and reads
    // as one ("≈ $4.99/mo") rather than as a price.
    yearly: perMonthAnchor
      ? {
          title: "Yearly",
          sub: yearlySub,
          price: annualPrice,
          per: "/yr",
          priceNote: `≈ ${perMonthAnchor}/mo`,
          badge: yearlyBadge,
          badgeTone: yearlyTrialBadge ? "trial" : "save",
        }
      : {
          title: "Yearly",
          sub: yearlySub,
          price: annualPrice,
          per: "/yr",
          badge: yearlyBadge,
          badgeTone: yearlyTrialBadge ? "trial" : "save",
        },
    monthly: {
      title: "Monthly",
      sub: "billed monthly",
      price: monthlyPrice,
      per: "/mo",
      badge: monthlyBadge,
      badgeTone: "trial",
    },
    footer: {
      yearly: planFooter(yearly, annualPrice, 'year', trialEligible.yearly),
      monthly: planFooter(monthly, monthlyPrice, 'month', trialEligible.monthly),
    },
    cta: {
      monthly: planCta(monthly, monthlyPrice, "mo", "month", trialEligible.monthly),
      yearly: planCta(yearly, annualPrice, "yr", "year", trialEligible.yearly),
    },
  };
}
