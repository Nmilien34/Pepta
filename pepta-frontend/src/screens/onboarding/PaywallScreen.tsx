// Onboarding screen 25 — Paywall. Value-forward, with an interactive plan
// selector. Custom chrome (X + Restore) rather than the progress scaffold,
// matching the design lab.

import React, { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StatusBar, View } from "react-native";
import { Icon } from "../../components/Icon";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../theme";
import { AppText, Button, Mascot } from "../../components";
import { useAuth } from "../../context/AuthContext";
import { PRIVACY_URL, TERMS_URL } from "../../config";
import { api } from "../../services/api";
import {
  isRevenueCatPurchaseCancelled,
  type PaywallPackages,
  revenueCat,
  type RevenueCatPlan,
} from "../../services/revenueCat";
import { buildPaywallPricing } from "./paywallPricing";

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
  "Apple Health & export",
];
const LEGAL_FOOTER_LABEL = "Terms & Privacy";

function openLegalUrl(url: string) {
  Linking.openURL(url).catch(() => undefined);
}

export function PaywallScreen({ onComplete }: PaywallScreenProps) {
  const theme = useTheme();
  const auth = useAuth();
  const [plan, setPlan] = useState<Plan>("yearly");
  const [completing, setCompleting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [paywallPackages, setPaywallPackages] =
    useState<PaywallPackages | null>(null);
  const pricing = buildPaywallPricing(paywallPackages);

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
        if (mounted) setPaywallPackages(packages);
      })
      .catch(() => {
        if (mounted) setPaywallPackages(null);
      });

    return () => {
      mounted = false;
    };
  }, [auth.user?.id]);

  const refreshEntitlement = async (optimisticActive: boolean) => {
    if (!auth.user) return;

    if (optimisticActive) {
      auth.updateCachedUser({
        ...auth.user,
        entitlement: {
          ...auth.user.entitlement,
          status: "active",
          willRenew: true,
          revenueCatCustomerId: auth.user.id,
          revenueCatEntitlement: "pro",
        },
      });
    }

    try {
      auth.updateCachedUser(await api.getCurrentUser());
    } catch {
      // The webhook can trail the SDK result by a moment; the optimistic state
      // keeps the UI unlocked while the backend catches up.
    }
  };

  const completeSetup = async (optimisticActive: boolean) => {
    await refreshEntitlement(optimisticActive);
    await onComplete();
  };

  const handleSkip = async () => {
    if (completing) return;
    setMessage(null);
    setFailed(false);
    setCompleting(true);
    try {
      await completeSetup(false);
    } catch {
      setFailed(true);
    } finally {
      setCompleting(false);
    }
  };

  const handleStart = async () => {
    if (!auth.user?.id || completing) return;
    setMessage(null);
    setFailed(false);
    setCompleting(true);
    try {
      const result = await revenueCat.purchasePlan(auth.user.id, plan);
      await completeSetup(result.entitlementActive);
    } catch (error) {
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
          <Pressable
            onPress={() => void handleSkip()}
            hitSlop={theme.sizes.hitSlop}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Icon name="close" size={24} color={theme.colors.textSecondary} />
          </Pressable>
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
            <Mascot pose="idle" size={74} />
            <AppText variant="obTitle" align="center">
              Unlock the full tracker
            </AppText>
            <AppText variant="caption" color="textSecondary" align="center">
              Levels, muscle, meals, insights — everything Pepta does.
            </AppText>
          </View>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              rowGap: 9,
              marginTop: theme.spacing.lg,
            }}
          >
            {FEATURES.map((f) => (
              <View
                key={f}
                style={{
                  flexBasis: "50%",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                <Icon
                  name="checkmark-circle"
                  size={16}
                  color={theme.colors.fiber}
                />
                <AppText
                  variant="caption"
                  color="textPrimary"
                  style={{ flex: 1 }}
                >
                  {f}
                </AppText>
              </View>
            ))}
          </View>

          <View style={{ marginTop: theme.spacing.xl, gap: 10 }}>
            <PlanCard
              selected={plan === "yearly"}
              onPress={() => setPlan("yearly")}
              title={pricing.yearly.title}
              sub={pricing.yearly.sub}
              price={pricing.yearly.price}
              per={pricing.yearly.per}
              badge={pricing.yearly.badge}
            />
            <PlanCard
              selected={plan === "monthly"}
              onPress={() => setPlan("monthly")}
              title={pricing.monthly.title}
              sub={pricing.monthly.sub}
              price={pricing.monthly.price}
              per={pricing.monthly.per}
            />
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
          <Button
            label={completing ? "Working…" : "Start 7-day free trial"}
            onPress={() => void handleStart()}
            disabled={completing}
          />
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

interface PlanCardProps {
  selected: boolean;
  onPress(): void;
  title: string;
  sub: string;
  price: string;
  per: string;
  badge?: string;
}

function PlanCard({
  selected,
  onPress,
  title,
  sub,
  price,
  per,
  badge,
}: PlanCardProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={{
        position: "relative",
        borderRadius: 16,
        borderWidth: 2,
        borderColor: selected ? theme.colors.primary : theme.colors.border,
        backgroundColor: selected ? "#F7F4FF" : theme.colors.surface,
        padding: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      {badge ? (
        <View
          style={{
            position: "absolute",
            top: -9,
            right: 14,
            backgroundColor: theme.colors.primary,
            paddingVertical: 3,
            paddingHorizontal: 9,
            borderRadius: theme.radii.pill,
          }}
        >
          <AppText
            variant="caption"
            style={{
              color: "#FFFFFF",
              fontWeight: "800",
              fontSize: 10,
              letterSpacing: 0.4,
            }}
          >
            {badge}
          </AppText>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Icon
          name={selected ? "checkmark-circle" : "ellipse-outline"}
          size={20}
          color={selected ? theme.colors.primary : theme.colors.textTertiary}
        />
        <View>
          <AppText variant="bodyStrong" style={{ fontWeight: "700" }}>
            {title}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {sub}
          </AppText>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <AppText variant="statMedium" style={{ fontSize: 20 }}>
          {price}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {per}
        </AppText>
      </View>
    </Pressable>
  );
}
