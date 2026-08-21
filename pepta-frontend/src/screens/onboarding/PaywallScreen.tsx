// Onboarding — Paywall v2 (design-lab/paywall-v2.html, "a reason to say yes").
// Outcome framing, not offer framing: the headline pays off the store
// listing's promise, three benefit rows sell what changes for the user (on
// BOTH states — the value doesn't depend on the selected plan, only the
// terms do), and the offer's mechanics are demoted to a compact looping
// terms carousel above the CTA. The v1 hero timeline and the six-item
// feature grid are gone — v1 sold the terms of the offer; nothing sold the
// app. Motion: one entrance stagger chain (TimelineRow's old curve), then
// exactly two loops — the live-level dot (that row's literal claim) and the
// terms carousel (information delivery, three terms sharing one slot).
// Benefits do NOT re-animate on plan switch; only the terms zone swaps.
// Restore-only chrome, no progress scaffold.

import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Icon } from "../../components/Icon";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../theme";
import { AppText, GlassButton } from "../../components";
import { typography } from "../../theme/typography";
import { trialTermSlides, type TrialTermSlide } from "./paywallTimeline";
import { useAuth } from "../../context/AuthContext";
import { PRIVACY_URL, TERMS_URL } from "../../config";
import { api } from "../../services/api";
import {
  isRevenueCatPurchaseCancelled,
  type PaywallPackages,
  revenueCat,
  REVENUECAT_ENTITLEMENT_ID,
  type RevenueCatPlan,
} from "../../services/revenueCat";
import {
  logPaywallDismissed,
  logPaywallOfferingDebug,
  logPaywallShown,
  logPurchaseStarted,
} from "../../services/funnelEvents";
import { buildPaywallPricing, freeTrialOf } from "./paywallPricing";
import { PaywallProofCarousel } from "./PaywallProofCarousel";
import { markPurchaseSuccess } from "../../services/purchaseGrace";
import { scheduleTrialEndReminder } from "../../services/trialReminder.service";

export interface PaywallScreenProps {
  onComplete(): void | Promise<void>;
}

type Plan = RevenueCatPlan;

// The entrance chain's shared curve — TimelineRow's exact shipped easing.
const RISE_EASING = Easing.bezier(0.2, 0.7, 0.2, 1);
const RISE_STEP_MS = 110;
const LEGAL_FOOTER_LABEL = "Terms & Privacy";

function openLegalUrl(url: string) {
  Linking.openURL(url).catch(() => undefined);
}

export function PaywallScreen({ onComplete }: PaywallScreenProps) {
  const theme = useTheme();
  const auth = useAuth();
  const [plan, setPlanState] = useState<Plan>("yearly");
  // A selection tick on every plan switch — the whole screen re-keys off it.
  const setPlan = (next: Plan) => {
    if (next === plan) return;
    if (Platform.OS !== "web") void Haptics.selectionAsync().catch(() => undefined);
    setPlanState(next);
  };
  const [completing, setCompleting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [paywallPackages, setPaywallPackages] =
    useState<PaywallPackages | null>(null);
  const pricing = buildPaywallPricing(paywallPackages, {
    monthly: paywallPackages?.trial.monthly.eligible ?? false,
    yearly: paywallPackages?.trial.yearly.eligible ?? false,
  });
  const plansReady = paywallPackages !== null;
  // paywall_shown fires once per presentation, when the offering load settles
  // (so `variant` is the real experiment arm, or 'unknown' on failure).
  const shownLogged = useRef(false);
  // paywall_dismissed context for the AppState listener (refs so the listener
  // never re-subscribes and never fires with stale closure state).
  const dismissContext = useRef({ variant: "unknown", trialCopyShown: false });
  const selectedPlanRef = useRef<Plan>(plan);
  selectedPlanRef.current = plan;
  const purchasedRef = useRef(false);
  const dismissLogged = useRef(false);

  const logShownOnce = (
    variant: string,
    trialCopyShown: boolean,
    trialCopyPlans: "none" | "monthly" | "yearly" | "both",
  ) => {
    if (shownLogged.current) return;
    shownLogged.current = true;
    dismissContext.current = { variant, trialCopyShown };
    // The default plan is the useState initial above — restate it here so the
    // dashboard shows it explicitly rather than by convention.
    logPaywallShown(variant, { defaultSelectedPlan: "yearly", trialCopyShown, trialCopyPlans });
  };

  useEffect(() => {
    let mounted = true;

    if (!auth.user?.id) {
      setPaywallPackages(null);
      return () => {
        mounted = false;
      };
    }

    revenueCat
      .getPaywallPackages(auth.user.id)
      .then((packages) => {
        if (!mounted) return;
        setPaywallPackages(packages);
        // Same derivation the render uses: a plan "shows trial copy" when its
        // OWN package yields trial copy (badge or free CTA) for this user.
        const yearlyTrialVisible =
          packages != null &&
          packages.trial.yearly.eligible &&
          freeTrialOf(packages.yearly) != null;
        const monthlyTrialVisible =
          packages != null &&
          packages.trial.monthly.eligible &&
          freeTrialOf(packages.monthly) != null;
        const trialCopyPlans =
          yearlyTrialVisible && monthlyTrialVisible
            ? "both"
            : yearlyTrialVisible
              ? "yearly"
              : monthlyTrialVisible
                ? "monthly"
                : "none";
        // Unambiguous: refers to the DEFAULT-SELECTED plan (yearly).
        logShownOnce(packages?.offeringId ?? "unknown", yearlyTrialVisible, trialCopyPlans);
        if (packages) {
          // TODO(remove): temporary paywall diagnostic — see funnelEvents.
          const debugFor = (pkg: typeof packages.monthly, plan: "monthly" | "yearly") => {
            const intro = pkg.product.introPrice;
            return {
              productId: pkg.product.identifier,
              hasIntroPrice: intro != null,
              introOfferPeriod:
                intro?.periodNumberOfUnits != null && intro?.periodUnit != null
                  ? `${intro.periodNumberOfUnits} ${String(intro.periodUnit).toLowerCase()}`
                  : null,
              rawEligibilityStatus: packages.trial[plan].rawStatus,
              trialEligible: packages.trial[plan].eligible,
            };
          };
          logPaywallOfferingDebug({
            offeringId: packages.offeringId,
            monthly: debugFor(packages.monthly, "monthly"),
            yearly: debugFor(packages.yearly, "yearly"),
            trialCopyShown: yearlyTrialVisible,
          });
        }
      })
      .catch((error) => {
        // Loud by design: a silent fallback here would hide the experiment
        // rendering the wrong arm or no store plans at all.
        console.error("[Paywall] getOfferings failed:", error);
        if (!mounted) return;
        setPaywallPackages(null);
        logShownOnce("unknown", false, "none");
      });

    return () => {
      mounted = false;
    };
  }, [auth.user?.id]);

  // paywall_dismissed: the wall has no dismiss control, so the only "leave"
  // is backgrounding the app. 'background' only — the StoreKit purchase sheet
  // drives the app 'inactive', and counting that would tag every purchaser as
  // having dismissed. Once per presentation.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "background") return;
      if (dismissLogged.current || purchasedRef.current) return;
      dismissLogged.current = true;
      logPaywallDismissed({
        variant: dismissContext.current.variant,
        selectedPlan: selectedPlanRef.current,
        trialCopyShown: dismissContext.current.trialCopyShown,
      });
    });
    return () => subscription.remove();
  }, []);

  /**
   * Reconcile with the server after the store says the purchase succeeded.
   *
   * NO FABRICATED ENTITLEMENT. This used to pin a hand-built `active`
   * entitlement — complete with a made-up revenueCatCustomerId — into the
   * persisted user whenever the backend disagreed, and nothing ever unpinned
   * it. A user whose purchase webhook was lost saw "Pepta Plus · Active" on
   * the Account screen forever while every premium route returned 403.
   *
   * The gap between StoreKit confirming and the webhook landing is covered by
   * the BOUNDED purchase grace opened in completeSetup, not by lying in
   * durable state. And the link call below is what lets the server recover on
   * its own if that webhook never arrives.
   */
  const refreshEntitlement = async () => {
    if (!auth.user) return;

    // Report which RevenueCat customer this device is. Logged, not swallowed:
    // this failing is precisely how a paying user stays behind the paywall.
    const appUserId = revenueCat.currentAppUserId();
    if (appUserId) {
      await api.linkRevenueCatAppUserId(appUserId).catch((error: unknown) => {
        console.warn("[paywall] Could not link the RevenueCat customer id.", error);
      });
    }

    try {
      auth.updateCachedUser(await api.getCurrentUser());
    } catch (error) {
      console.warn("[paywall] Could not refresh entitlement after purchase.", error);
    }
  };

  const completeSetup = async () => {
    if (!auth.user) return;
    // Success path (purchase or restore): whatever happens to the app state
    // after this, it is not a dismissal.
    purchasedRef.current = true;
    // The SDK just confirmed entitlement on this device; the backend's
    // webhook-fed decision will trail it. Open the grace window BEFORE any
    // navigation so AccessGate can never bounce this user back onto a
    // paywall while the backend catches up.
    markPurchaseSuccess(auth.user.id);
    await refreshEntitlement();
    await onComplete();
  };

  const handleStart = async () => {
    if (!auth.user?.id || completing || !plansReady) return;
    // Funnel: CTA tapped, before the StoreKit sheet.
    logPurchaseStarted(
      paywallPackages?.offeringId ?? "unknown",
      plan === "yearly" ? "annual" : "monthly",
    );
    setMessage(null);
    setFailed(false);
    setCompleting(true);
    try {
      const result = await revenueCat.purchasePlan(auth.user.id, plan);
      // Day-2 touchpoint: brings them back into the app while the trial is
      // still live. No-ops when this was not a trial, and never throws — see
      // scheduleTrialEndReminder. Deliberately carries no price and no
      // cancellation path (2026-08-12); see trialReminder.ts for the trade-off.
      await scheduleTrialEndReminder(result.customerInfo, REVENUECAT_ENTITLEMENT_ID);
      if (!result.entitlementActive) {
        setFailed(true);
        setMessage(
          "Purchase is still syncing. Tap Restore in a moment to unlock Pepta Plus.",
        );
        return;
      }
      await completeSetup();
    } catch (error) {
      // Keep cancellation App Review-safe: no custom retention overlay here.
      if (isRevenueCatPurchaseCancelled(error)) return;
      setFailed(true);
      setMessage(
        "Purchase could not be completed. Check your connection and try again.",
      );
    } finally {
      setCompleting(false);
    }
  };

  const handleRestore = async () => {
    if (!auth.user?.id || completing) return;
    setMessage(null);
    setFailed(false);
    setCompleting(true);
    try {
      const result = await revenueCat.restore(auth.user.id);
      if (!result.entitlementActive) {
        setMessage("No active Pepta Pro purchase was found for this Apple ID.");
        return;
      }
      await completeSetup();
    } catch {
      setFailed(true);
      setMessage(
        "Restore could not be completed. Check your connection and try again.",
      );
    } finally {
      setCompleting(false);
    }
  };

  // The selected plan's trial drives the whole upper half: headline, timeline
  // vs features grid, and the CTA (via pricing). PACKAGE-AGNOSTIC: each
  // plan's trial comes from its OWN package's introPrice and its OWN
  // eligibility, so the timeline, headline, charge date, and post-trial price
  // all follow the selection — including when the two plans carry different
  // trial lengths.
  const selectedPackage =
    paywallPackages == null
      ? null
      : plan === "monthly"
        ? paywallPackages.monthly
        : paywallPackages.yearly;
  const selectedTrial =
    paywallPackages != null && selectedPackage != null && paywallPackages.trial[plan].eligible
      ? freeTrialOf(selectedPackage)
      : null;
  const termSlides = selectedTrial ? trialTermSlides(selectedTrial, new Date()) : null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: theme.spacing.xl,
            paddingTop: theme.spacing.sm,
          }}
        >
          <View style={{ width: 64 }} />
          <Pressable
            onPress={() => void handleRestore()}
            hitSlop={theme.sizes.hitSlop}
            accessibilityRole="button"
          >
            <AppText variant="caption" color="textSecondary">
              {completing ? "Working…" : "Restore"}
            </AppText>
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: theme.spacing.xl,
            paddingTop: theme.spacing.sm,
            paddingBottom: theme.spacing.lg,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
        >
          <Rise delay={0} style={{ alignItems: "center", gap: 4 }}>
            <AppText variant="obTitle" align="center">
              Never wonder what’s in your body again
            </AppText>
            <AppText variant="caption" color="textSecondary" align="center">
              Here is what you get today.
            </AppText>
          </Rise>

          {/* NOT keyed by plan — the proof does not change with the selection,
              so it must not re-animate when the user compares plans. */}
          <PaywallProofCarousel />

          {/* The offer block sits low, anchored above the CTA; the carousel
              takes whatever height is left. A fixed margin would look right on
              one device and reopen a gap on a taller one. */}
          <View style={{ flexGrow: 1, minHeight: 10 }} />

          <Rise delay={3 * RISE_STEP_MS}>
            <View style={{ flexDirection: "row", gap: 9, marginTop: theme.spacing.md }}>
              <PlanColumn
                selected={plan === "yearly"}
                onPress={() => setPlan("yearly")}
                title={pricing.yearly.title}
                sub={pricing.yearly.sub}
                price={pricing.yearly.price}
                per={pricing.yearly.per}
                priceNote={pricing.yearly.priceNote}
                badge={pricing.yearly.badge}
                badgeTone={pricing.yearly.badgeTone}
              />
              <PlanColumn
                selected={plan === "monthly"}
                onPress={() => setPlan("monthly")}
                title={pricing.monthly.title}
                sub={pricing.monthly.sub}
                price={pricing.monthly.price}
                per={pricing.monthly.per}
                badge={pricing.monthly.badge}
                badgeTone={pricing.monthly.badgeTone}
              />
            </View>
          </Rise>

          {/* Terms zone: carousel when the selected plan has a trial, the
              reassure row otherwise. Re-keyed by zone TYPE only, so plan
              switches cross-fade the zone (160ms) without replaying the
              benefits above. */}
          <Rise delay={4 * RISE_STEP_MS}>
            {termSlides ? (
              <FadeIn key="terms-carousel">
                <TrialTermsCarousel slides={termSlides} />
              </FadeIn>
            ) : (
              <FadeIn key="terms-reassure">
                <View style={styles.reassureRow}>
                  <View style={styles.reassureItem}>
                    <Icon name="checkmark" size={12} color={theme.colors.fiber} />
                    <AppText variant="caption" color="textSecondary" style={{ fontSize: 10.5 }}>
                      Cancel anytime
                    </AppText>
                  </View>
                  <View style={styles.reassureItem}>
                    <Icon name="checkmark" size={12} color={theme.colors.fiber} />
                    <AppText variant="caption" color="textSecondary" style={{ fontSize: 10.5 }}>
                      {plan === "yearly" ? "One payment — done for the year" : "Billed monthly"}
                    </AppText>
                  </View>
                  <View style={styles.reassureItem}>
                    <Icon name="checkmark" size={12} color={theme.colors.fiber} />
                    <AppText variant="caption" color="textSecondary" style={{ fontSize: 10.5 }}>
                      Full access today
                    </AppText>
                  </View>
                </View>
              </FadeIn>
            )}
          </Rise>
        </ScrollView>

        <Rise
          delay={5 * RISE_STEP_MS}
          style={{
            paddingHorizontal: theme.spacing.xl,
            // 18 between the terms strip and the CTA: the offer and the action
            // are separate beats, and 12 (the plans->terms gap) reads as one.
            paddingTop: 18,
            paddingBottom: theme.spacing.xs,
          }}
        >
          {failed || message ? (
            <AppText
              variant="caption"
              color="danger"
              align="center"
              style={{ marginBottom: theme.spacing.sm }}
            >
              {message ??
                "We couldn’t save your setup. Check your connection and try again."}
            </AppText>
          ) : null}
          {!plansReady && !failed && !message ? (
            <AppText
              variant="caption"
              color="textSecondary"
              align="center"
              style={{ marginBottom: theme.spacing.sm }}
            >
              Loading App Store plans…
            </AppText>
          ) : null}
          <GlassButton
            label={completing ? "Working…" : pricing.cta[plan].label}
            onPress={() => void handleStart()}
            disabled={completing || !plansReady}
          />
          {pricing.cta[plan].subline ? (
            <AppText
              variant="caption"
              color="textSecondary"
              align="center"
              style={{ fontSize: 11, marginTop: theme.spacing.sm }}
            >
              {pricing.cta[plan].subline}
            </AppText>
          ) : null}
          <PaywallLegalFooter text={pricing.footer[plan]} />
        </Rise>
      </SafeAreaView>
    </View>
  );
}

function PaywallLegalFooter({ text }: { text: string }) {
  const theme = useTheme();
  const legalStart = text.indexOf(LEGAL_FOOTER_LABEL);
  const footerStyle = { fontSize: 10, marginTop: theme.spacing.sm };

  if (legalStart < 0) {
    return (
      <AppText
        variant="caption"
        color="textTertiary"
        align="center"
        style={footerStyle}
      >
        {text}
      </AppText>
    );
  }

  return (
    <AppText
      variant="caption"
      color="textTertiary"
      align="center"
      style={footerStyle}
    >
      {text.slice(0, legalStart)}
      <AppText
        variant="caption"
        color="primary"
        accessibilityRole="link"
        onPress={() => openLegalUrl(TERMS_URL)}
        style={{ fontSize: 10, fontWeight: "800" }}
      >
        Terms
      </AppText>
      {" & "}
      <AppText
        variant="caption"
        color="primary"
        accessibilityRole="link"
        onPress={() => openLegalUrl(PRIVACY_URL)}
        style={{ fontSize: 10, fontWeight: "800" }}
      >
        Privacy
      </AppText>
    </AppText>
  );
}

/**
 * One entrance step of the stagger chain: fade + rise 8px on the shared
 * curve (the v1 TimelineRow's exact motion, promoted to the whole screen).
 * Runs once per mount — the chain must not replay on plan switches.
 */
function Rise({
  delay,
  style,
  children,
}: {
  delay: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(rise, {
      toValue: 1,
      duration: 360,
      delay,
      easing: RISE_EASING,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [rise, delay]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: rise,
          transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** 160ms fade for the terms-zone swap — the only motion on plan switch. */
function FadeIn({ children }: { children: React.ReactNode }) {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(fade, {
      toValue: 1,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [fade]);
  return <Animated.View style={{ opacity: fade }}>{children}</Animated.View>;
}

// Carousel timing: 2.2s hold per term, 260ms slide-fade transition (130 out +
// 130 in), matching design-lab/paywall-v2.html's 6.6s full cycle.
const SLIDE_HOLD_MS = 2200;
const SLIDE_FADE_MS = 130;

/**
 * The looping trial-terms carousel: one term per slot with sync'd dots.
 * Reassurance layer only — the 3.1.2 disclosure lives in the always-visible
 * CTA subline + legal footer, so any slide may be up at decision time.
 * Reduce Motion: the loop is replaced by the static all-terms strip.
 */
function TrialTermsCarousel({ slides }: { slides: TrialTermSlide[] }) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const indexRef = useRef(0);
  const fade = useRef(new Animated.Value(1)).current;
  const shift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion || slides.length < 2) return undefined;
    let cancelled = false;
    const tick = () => {
      Animated.parallel([
        Animated.timing(fade, { toValue: 0, duration: SLIDE_FADE_MS, easing: RISE_EASING, useNativeDriver: true }),
        Animated.timing(shift, { toValue: -9, duration: SLIDE_FADE_MS, easing: RISE_EASING, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (!finished || cancelled) return;
        indexRef.current = (indexRef.current + 1) % slides.length;
        setIndex(indexRef.current);
        shift.setValue(9);
        Animated.parallel([
          Animated.timing(fade, { toValue: 1, duration: SLIDE_FADE_MS, easing: RISE_EASING, useNativeDriver: true }),
          Animated.timing(shift, { toValue: 0, duration: SLIDE_FADE_MS, easing: RISE_EASING, useNativeDriver: true }),
        ]).start();
      });
    };
    const interval = setInterval(tick, SLIDE_HOLD_MS + SLIDE_FADE_MS * 2);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [reduceMotion, slides.length, fade, shift]);

  if (reduceMotion) {
    return (
      <View style={styles.termsStrip}>
        <AppText variant="caption" color="textPrimary" style={styles.termsStaticText} numberOfLines={1}>
          {slides.map((slide) => slide.label).join("  ·  ")}
        </AppText>
      </View>
    );
  }

  // Slides can shrink on a plan switch (different trial length) — clamp.
  const active = slides[Math.min(index, slides.length - 1)]!;
  return (
    <View style={styles.termsStrip}>
      <Animated.View
        style={[styles.termsSlide, { opacity: fade, transform: [{ translateY: shift }] }]}
      >
        <Icon name={active.icon} size={14} color={theme.colors.primary} />
        <AppText variant="caption" color="textPrimary" style={styles.termsLabel} numberOfLines={1}>
          {active.label}
        </AppText>
      </Animated.View>
      <View style={styles.termsDots} pointerEvents="none">
        {slides.map((slide, dotIndex) => (
          <View
            key={slide.key}
            style={[
              styles.termsDot,
              { backgroundColor: dotIndex === index ? theme.colors.primary : "rgba(124,92,252,0.25)" },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

interface PlanColumnProps {
  selected: boolean;
  onPress(): void;
  title: string;
  sub: string;
  price: string;
  per: string;
  /** Billed total in light type under a per-month anchor (3.1.2(c)). */
  priceNote?: string;
  badge?: string;
  /** "trial" renders the badge green (fiber) so "free" never reads as "selected". */
  badgeTone?: "save" | "trial";
}

/** A plan card in the side-by-side column layout. Same anatomy as the old
 * stacked PlanCard — radius 16, 2px border, #F7F4FF selected — just upright. */
function PlanColumn({
  selected,
  onPress,
  title,
  sub,
  price,
  per,
  priceNote,
  badge,
  badgeTone = "save",
}: PlanColumnProps) {
  const theme = useTheme();
  const press = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() =>
        Animated.spring(press, { toValue: 0.97, friction: 6, tension: 200, useNativeDriver: true }).start()
      }
      onPressOut={() =>
        Animated.spring(press, { toValue: 1, friction: 6, tension: 200, useNativeDriver: true }).start()
      }
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={{ flex: 1 }}
    >
      <Animated.View
        style={[
          styles.planColumn,
          {
            borderColor: selected ? theme.colors.primary : theme.colors.border,
            backgroundColor: selected ? "#F7F4FF" : theme.colors.surface,
            transform: [{ scale: press }],
          },
        ]}
      >
        {badge ? (
          // Centered over the card, not right-pinned: on the narrow
          // side-by-side columns a right-aligned float lands on the radio
          // control below it (Nick, 1.0.5 (28) TestFlight).
          <View style={styles.planBadgeWrap} pointerEvents="none">
            <View
              style={[
                styles.planBadge,
                { backgroundColor: badgeTone === "trial" ? theme.colors.fiber : theme.colors.primary },
              ]}
            >
              <AppText variant="caption" style={styles.planBadgeText} numberOfLines={1}>
                {badge.toUpperCase()}
              </AppText>
            </View>
          </View>
        ) : null}
        <View style={styles.planRadio}>
          <Icon
            name={selected ? "checkmark-circle" : "ellipse-outline"}
            size={17}
            color={selected ? theme.colors.primary : theme.colors.textTertiary}
          />
        </View>
        <AppText variant="bodyStrong" style={{ fontWeight: "700", fontSize: 14 }}>
          {title}
        </AppText>
        <AppText variant="caption" color="textSecondary" style={{ fontSize: 10.5 }}>
          {sub}
        </AppText>
        <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 8 }}>
          <AppText variant="statMedium" style={{ fontSize: 19 }}>
            {price}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {per}
          </AppText>
        </View>
        <AppText variant="caption" color="textTertiary" style={{ marginTop: 1, fontSize: 10 }}>
          {priceNote ?? " "}
        </AppText>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  termsStrip: {
    marginTop: 12,
    height: 34,
    borderRadius: 999,
    backgroundColor: "#F1EDFF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  termsSlide: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 30 },
  termsLabel: { fontSize: 12.5, fontWeight: "800", fontFamily: typography.fonts.heavy },
  termsStaticText: { fontSize: 10, fontWeight: "700", paddingHorizontal: 14 },
  termsDots: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 3.5,
  },
  termsDot: { width: 4.5, height: 4.5, borderRadius: 999 },
  reassureRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginTop: 12,
  },
  reassureItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  planColumn: {
    position: "relative",
    borderRadius: 16,
    borderWidth: 2,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 11,
  },
  planBadgeWrap: {
    position: "absolute",
    top: -9,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 1,
  },
  planBadge: {
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 999,
  },
  planBadgeText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 9,
    letterSpacing: 0.4,
  },
  planRadio: { position: "absolute", top: 11, right: 10 },
});
