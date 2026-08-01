// Onboarding — Paywall (screen C of the trial warm-up sequence,
// design-lab/trial-warmup.html). Arrival framing, not transaction framing:
// the headline announces the trial starting, a data-driven timeline names the
// reminder day and the exact charge date (naming the charge is what removes
// the silently-billed fear), and the plans sit side by side beneath it.
// When the SELECTED plan carries no trial — the control arm, or yearly today —
// the timeline collapses to its "Today" row and the features grid reclaims
// the space, so the component never promises free days the selected plan
// won't deliver. Restore-only chrome, no progress scaffold.

import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Icon } from "../../components/Icon";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../theme";
import { AppText, Button } from "../../components";
import { typography } from "../../theme/typography";
import { buildTrialTimeline, freeStartHeadline, type TrialTimelineRow } from "./paywallTimeline";
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
import { logPaywallOfferingDebug, logPaywallShown, logPurchaseStarted } from "../../services/funnelEvents";
import { buildPaywallPricing, freeTrialOf } from "./paywallPricing";
import { scheduleTrialEndReminder } from "../../services/trialReminder.service";

export interface PaywallScreenProps {
  onComplete(): void | Promise<void>;
}

type Plan = RevenueCatPlan;

const FEATURES = [
  "Medication level & curve",
  "Injection-site map",
  "Muscle-protection tracking",
  "Unlimited AI insights",
  "Meal scan & voice",
  "Report export",
];
const LEGAL_FOOTER_LABEL = "Terms & Privacy";
const PREMIUM_ENTITLEMENT_STATUSES = new Set([
  "trialing",
  "active",
  "active_canceled",
  "past_due",
]);

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
  const pricing = buildPaywallPricing(
    paywallPackages,
    paywallPackages?.monthlyTrialEligible ?? false,
  );
  const plansReady = paywallPackages !== null;
  // paywall_shown fires once per presentation, when the offering load settles
  // (so `variant` is the real experiment arm, or 'unknown' on failure).
  const shownLogged = useRef(false);

  const logShownOnce = (variant: string, trialCopyShown: boolean) => {
    if (shownLogged.current) return;
    shownLogged.current = true;
    // The default plan is the useState initial above — restate it here so the
    // dashboard shows it explicitly rather than by convention.
    logPaywallShown(variant, { defaultSelectedPlan: "yearly", trialCopyShown });
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
        // Same derivation the render uses — badge presence IS trial visibility.
        const trialCopyShown =
          buildPaywallPricing(packages, packages?.monthlyTrialEligible ?? false).monthly.badge != null;
        logShownOnce(packages?.offeringId ?? "unknown", trialCopyShown);
        if (packages) {
          // TODO(remove): temporary experiment diagnostic — see funnelEvents.
          const intro = packages.monthly.product.introPrice;
          logPaywallOfferingDebug({
            offeringId: packages.offeringId,
            monthlyProductId: packages.monthly.product.identifier,
            hasIntroPrice: intro != null,
            introOfferPeriod:
              intro?.periodNumberOfUnits != null && intro?.periodUnit != null
                ? `${intro.periodNumberOfUnits} ${String(intro.periodUnit).toLowerCase()}`
                : null,
            rawEligibilityStatus: packages.monthlyTrialEligibilityStatus,
            monthlyTrialEligible: packages.monthlyTrialEligible,
            trialCopyShown,
          });
        }
      })
      .catch((error) => {
        // Loud by design: a silent fallback here would hide the experiment
        // rendering the wrong arm or no store plans at all.
        console.error("[Paywall] getOfferings failed:", error);
        if (!mounted) return;
        setPaywallPackages(null);
        logShownOnce("unknown", false);
      });

    return () => {
      mounted = false;
    };
  }, [auth.user?.id]);

  const refreshEntitlement = async (optimisticActive: boolean) => {
    if (!auth.user) return;

    const optimisticEntitlement = {
      ...auth.user.entitlement,
      status: "active" as const,
      willRenew: true,
      revenueCatCustomerId: auth.user.id,
      revenueCatEntitlement: "pro",
    };

    if (optimisticActive) {
      auth.updateCachedUser({
        ...auth.user,
        entitlement: optimisticEntitlement,
      });
    }

    try {
      const refreshedUser = await api.getCurrentUser();
      const backendHasPremium = PREMIUM_ENTITLEMENT_STATUSES.has(
        refreshedUser.entitlement.status,
      );
      auth.updateCachedUser(
        optimisticActive && !backendHasPremium
          ? { ...refreshedUser, entitlement: optimisticEntitlement }
          : refreshedUser,
      );
    } catch {
      // The webhook can trail the SDK result by a moment; the optimistic state
      // keeps the UI unlocked while the backend catches up.
    }
  };

  const completeSetup = async (optimisticActive: boolean) => {
    await refreshEntitlement(optimisticActive);
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
      // Keep the paywall's promise. No-ops when this was not a trial, and
      // never throws — see scheduleTrialEndReminder.
      await scheduleTrialEndReminder(result.customerInfo, REVENUECAT_ENTITLEMENT_ID, {
        priceString: pricing.monthly.price,
      });
      if (!result.entitlementActive) {
        setFailed(true);
        setMessage(
          "Purchase is still syncing. Tap Restore in a moment to unlock Pepta Plus.",
        );
        return;
      }
      await completeSetup(true);
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
      await completeSetup(true);
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
  // vs features grid, and the CTA (via pricing). Yearly has no intro offer on
  // either arm today, so its branch is dormant until Apple-side config adds
  // one — at which point eligibility resolution must extend to that product
  // (see the note in paywallPricing) before this advertises $0.00.
  const selectedTrial =
    paywallPackages == null
      ? null
      : plan === "monthly"
        ? paywallPackages.monthlyTrialEligible
          ? freeTrialOf(paywallPackages.monthly)
          : null
        : freeTrialOf(paywallPackages.yearly);
  const bothPlansTrial =
    paywallPackages != null &&
    freeTrialOf(paywallPackages.yearly) != null &&
    paywallPackages.monthlyTrialEligible &&
    freeTrialOf(paywallPackages.monthly) != null;
  // Design rule (badge conflict, resolved by scope): the monthly badge marks
  // the trial only when it DIFFERENTIATES the rows; when both plans carry a
  // trial the timeline owns the story and no trial badge renders.
  const monthlyBadge = bothPlansTrial ? undefined : pricing.monthly.badge;
  const timeline = selectedTrial ? buildTrialTimeline(selectedTrial, new Date()) : null;

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
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ alignItems: "center", gap: 4 }}>
            <AppText variant="obTitle" align="center">
              {selectedTrial ? freeStartHeadline(selectedTrial) : "Your plan is ready"}
            </AppText>
            <AppText variant="caption" color="textSecondary" align="center">
              Everything Pepta does, unlocked today.
            </AppText>
          </View>

          {/* Keyed by the selected plan so the rows replay their stagger when
              the trial state flips with a selection change. */}
          <View key={plan} style={[styles.timelineCard, { backgroundColor: theme.colors.surface }]}>
            {timeline ? (
              <>
                {timeline.length > 1 ? <View style={styles.timelineRail} /> : null}
                {timeline.map((row, index) => (
                  <TimelineRow key={row.key} row={row} index={index} />
                ))}
              </>
            ) : (
              <>
                <TimelineRow
                  row={{
                    key: "today",
                    title: "Instant access",
                    sub: "Your plan, levels and tracking — all of it, right now.",
                    day: "Today",
                  }}
                  index={0}
                />
                {/* No trial on the selected plan: the space the timeline
                    vacates is reclaimed by the features grid. */}
                <View style={styles.featureGrid}>
                  {FEATURES.map((f) => (
                    <View key={f} style={styles.featureItem}>
                      <Icon name="checkmark-circle" size={14} color={theme.colors.fiber} />
                      <AppText variant="caption" color="textPrimary" style={{ flex: 1, fontSize: 11 }}>
                        {f}
                      </AppText>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>

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
            />
            <PlanColumn
              selected={plan === "monthly"}
              onPress={() => setPlan("monthly")}
              title={pricing.monthly.title}
              sub={pricing.monthly.sub}
              price={pricing.monthly.price}
              per={pricing.monthly.per}
              badge={monthlyBadge}
              badgeTone="trial"
            />
          </View>

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
                {selectedTrial
                  ? "Reminder before charge"
                  : plan === "yearly"
                    ? "Billed once a year"
                    : "Billed monthly"}
              </AppText>
            </View>
          </View>
        </ScrollView>

        <View
          style={{
            paddingHorizontal: theme.spacing.xl,
            paddingTop: theme.spacing.sm,
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
          <Button
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
        </View>
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

const TIMELINE_ICON: Record<TrialTimelineRow["key"], string> = {
  today: "lock-open-outline",
  reminder: "notifications-outline",
  charge: "calendar-outline",
};

/** One timeline step, staggering into place (fade + rise, the flow's ease). */
function TimelineRow({ row, index }: { row: TrialTimelineRow; index: number }) {
  const theme = useTheme();
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(rise, {
      toValue: 1,
      duration: 360,
      delay: index * 110,
      easing: Easing.bezier(0.2, 0.7, 0.2, 1),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [rise, index]);
  const now = row.key === "today";
  return (
    <Animated.View
      style={[
        styles.timelineRow,
        index > 0 && { marginTop: 12 },
        {
          opacity: rise,
          transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        },
      ]}
    >
      <View style={[styles.timelineIcon, now && { backgroundColor: theme.colors.primary }]}>
        <Icon name={TIMELINE_ICON[row.key]} size={15} color={now ? "#FFFFFF" : theme.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" style={{ fontSize: 12.5, fontWeight: "800" }}>
          {row.title}
        </AppText>
        <AppText variant="caption" color="textSecondary" style={{ fontSize: 10.5, marginTop: 1 }}>
          {row.sub}
        </AppText>
      </View>
      <AppText variant="caption" color="textTertiary" style={styles.timelineDay}>
        {row.day.toUpperCase()}
      </AppText>
    </Animated.View>
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
          <View
            style={[
              styles.planBadge,
              { backgroundColor: badgeTone === "trial" ? theme.colors.fiber : theme.colors.primary },
            ]}
          >
            <AppText variant="caption" style={styles.planBadgeText}>
              {badge.toUpperCase()}
            </AppText>
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
  timelineCard: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(14,14,18,0.08)",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    position: "relative",
  },
  timelineRail: {
    position: "absolute",
    left: 29,
    top: 26,
    bottom: 24,
    width: 2,
    backgroundColor: "#EDE9FB",
  },
  timelineRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  timelineIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#F1EDFF",
    alignItems: "center",
    justifyContent: "center",
  },
  timelineDay: {
    fontSize: 8.5,
    letterSpacing: 0.5,
    fontFamily: typography.fonts.heavy,
    paddingTop: 2,
  },
  featureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 7,
    marginTop: 12,
    paddingTop: 11,
    borderTopWidth: 0.5,
    borderTopColor: "rgba(14,14,18,0.08)",
  },
  featureItem: {
    flexBasis: "50%",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingRight: 6,
  },
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
  planBadge: {
    position: "absolute",
    top: -9,
    right: 14,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 999,
    zIndex: 1,
  },
  planBadgeText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 9,
    letterSpacing: 0.4,
  },
  planRadio: { position: "absolute", top: 11, right: 10 },
});
