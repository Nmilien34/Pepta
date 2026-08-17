// Onboarding — warm-up A · The offer (design-lab/trial-warmup.html).
// One idea on the screen: the trial, stated as a gift, before any price is
// visible. No plan names, no bullets, no social proof — the screen's power is
// its emptiness. Sits right after the merged reveal+auth turn, so tapping the
// first-person CTA is the user's first chosen step toward the wall (the
// micro-commitment ladder the sequence is built on).
//
// TRIAL-GATED, RESOLVED HERE: the experiment's control arm has no trial, and
// promising "3 days on us" to someone whose paywall carries no trial would be
// a bait-and-switch. This screen resolves the live offering on mount (the SDK
// caches offerings, so this is fast) and either plays its entrance with the
// REAL duration, or silently skips the whole warm-up via onSkipToWall. Any
// error also skips — the warm-up must never be able to block the funnel.

import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Svg, { Path } from "react-native-svg";
import {
  ConvoGround,
  GlassButton,
  ConvoProgressHeader,
  convo,
} from "../../components";
import { LivingMascot } from "../../components/LivingMascot";
import { trialEndLabel } from './trialEndLabel';
import { typography } from "../../theme/typography";
import { useAuth } from "../../context/AuthContext";
import { revenueCat } from "../../services/revenueCat";
import { freeTrialOf, trialDurationLabel } from "./paywallPricing";

const RISE = 12;
const ENTRANCE_EASING = Easing.bezier(0.2, 0.7, 0.2, 1);

/** A four-point sparkle that twinkles on its own randomized-feeling phase. */
function Sparkle({
  size,
  style,
  delayMs,
}: {
  size: number;
  style: object;
  delayMs: number;
}) {
  const twinkle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delayMs),
        Animated.timing(twinkle, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(twinkle, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(600),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [twinkle, delayMs]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        style,
        {
          position: "absolute",
          opacity: twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.65] }),
          transform: [
            { scale: twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.1] }) },
          ],
        },
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M12 1 L14.4 9.6 L23 12 L14.4 14.4 L12 23 L9.6 14.4 L1 12 L9.6 9.6 Z"
          fill={convo.primary}
        />
      </Svg>
    </Animated.View>
  );
}

/** One block of the staggered entrance: fade + rise on its own delay. */
function Entrance({
  delayMs,
  children,
  style,
  onSettle,
}: {
  delayMs: number;
  children: React.ReactNode;
  style?: object;
  onSettle?: () => void;
}) {
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(rise, {
      toValue: 1,
      duration: 420,
      delay: delayMs,
      easing: ENTRANCE_EASING,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) onSettle?.();
    });
    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: rise,
          transform: [
            { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export interface TrialOfferScreenProps {
  progress: number;
  onBack?(): void;
  /** The companion's chosen name — the gift comes from them, not from "we". */
  companionName: string;
  /** Goal weight + unit, so the plan named here is the user's own. */
  goalWeight?: number;
  goalWeightUnit?: string;
  /** Forward to the value carousel. */
  onContinue(): void;
  /** No trial on the live offering (control arm / error): skip A AND B. */
  onSkipToWall(): void;
}

export function TrialOfferScreen({
  progress,
  onBack,
  companionName,
  goalWeight,
  goalWeightUnit,
  onContinue,
  onSkipToWall,
}: TrialOfferScreenProps) {
  const auth = useAuth();
  // null = resolving (renders just ground + chrome, indistinguishable from the
  // step transition); a string = the real duration label ("3 days").
  const [trialLabel, setTrialLabel] = useState<string | null>(null);
  // The halo breathes behind Pep — slow, opposite the bob, barely there.
  const breathe = useRef(new Animated.Value(0)).current;
  // A heartbeat on the held heart: two quick thumps, then rest.
  const thump = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    const userId = auth.user?.id;
    if (!userId) {
      onSkipToWall();
      return undefined;
    }
    revenueCat
      .getPaywallPackages(userId)
      .then((packages) => {
        if (!mounted) return;
        // Package-agnostic: any plan's own eligible zero-price intro counts.
        // When durations could differ between plans, announce the PRESELECTED
        // plan's (yearly) so the promise matches the wall the user lands on;
        // monthly's is only announced when yearly carries no trial at all.
        const yearlyTrial = packages?.trial.yearly.eligible
          ? freeTrialOf(packages.yearly)
          : null;
        const monthlyTrial = packages?.trial.monthly.eligible
          ? freeTrialOf(packages.monthly)
          : null;
        const trial = yearlyTrial ?? monthlyTrial;
        if (trial) {
          setTrialLabel(trialDurationLabel(trial));
        } else {
          onSkipToWall();
        }
      })
      .catch(() => {
        if (mounted) onSkipToWall();
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.id]);

  useEffect(() => {
    if (!trialLabel) return undefined;
    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 2100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 2100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    const thumpLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(1400),
        Animated.timing(thump, { toValue: 1, duration: 130, useNativeDriver: true }),
        Animated.timing(thump, { toValue: 0, duration: 170, useNativeDriver: true }),
        Animated.timing(thump, { toValue: 0.7, duration: 120, useNativeDriver: true }),
        Animated.timing(thump, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
    );
    breatheLoop.start();
    thumpLoop.start();
    return () => {
      breatheLoop.stop();
      thumpLoop.stop();
    };
  }, [trialLabel, breathe, thump]);

  const haloScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  // The whole mascot pulses ~3.5% on the thump — reads as the held heart beating.
  const heartbeat = thump.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <ConvoGround />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ConvoProgressHeader progress={progress} onBack={onBack} />
        {trialLabel ? (
          <View style={styles.body}>
            <Entrance delayMs={80}>
              <Text style={styles.eyebrow}>One last thing…</Text>
            </Entrance>

            <Entrance
              delayMs={260}
              style={styles.haloWrap}
              onSettle={() => {
                // Pep lands — a soft tap, the screen's one arrival haptic.
                if (Platform.OS !== "web") {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => undefined);
                }
              }}
            >
              <Animated.View style={[styles.halo, { transform: [{ scale: haloScale }] }]} />
              <View style={styles.halo2} />
              <Sparkle size={13} style={{ top: 4, left: 42 }} delayMs={0} />
              <Sparkle size={10} style={{ top: 26, right: 34 }} delayMs={700} />
              <Sparkle size={10} style={{ bottom: 18, left: 30 }} delayMs={1300} />
              <Animated.View style={{ transform: [{ scale: heartbeat }] }}>
                <LivingMascot pose="gift" size={170} bobSeconds={3.4} />
              </Animated.View>
            </Entrance>

            <Entrance delayMs={520}>
              <Text style={styles.hero}>
                {companionName} would love you{"\n"}to try Pepta —{"\n"}
                <Text style={styles.heroAccent}>{trialLabel} on us</Text>
              </Text>
            </Entrance>

            <Entrance delayMs={680}>
              <Text style={styles.heroSub}>
                {goalWeight != null
                  ? `Your plan to ${goalWeight} ${goalWeightUnit ?? 'lb'} is built and waiting.`
                  : 'Your plan is built and waiting.'}
                {"\n"}
                Yours free through {trialEndLabel(trialLabel, new Date())}.
              </Text>
            </Entrance>

            <View style={styles.footer}>
              <Entrance delayMs={840}>
                <GlassButton label="See my free offer" onPress={onContinue} />
              </Entrance>
            </View>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: convo.ground },
  safe: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 28, paddingTop: 26, paddingBottom: 30 },
  eyebrow: {
    fontFamily: typography.fonts.bold,
    fontSize: 13.5,
    letterSpacing: 0.2,
    color: convo.faint,
    textAlign: "center",
    marginTop: 14,
  },
  haloWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
    marginBottom: 6,
    height: 216,
  },
  halo: {
    position: "absolute",
    width: 206,
    height: 206,
    borderRadius: 999,
    backgroundColor: "rgba(124,92,252,0.07)",
  },
  halo2: {
    position: "absolute",
    width: 144,
    height: 144,
    borderRadius: 999,
    backgroundColor: "rgba(124,92,252,0.09)",
  },
  hero: {
    fontFamily: typography.fonts.heavy,
    fontSize: 29,
    lineHeight: 34,
    letterSpacing: -0.75,
    color: convo.ink,
    textAlign: "center",
    marginTop: 12,
  },
  heroAccent: { color: convo.primary },
  heroSub: {
    fontFamily: typography.fonts.semiBold,
    fontSize: 14.5,
    lineHeight: 21,
    color: convo.soft,
    textAlign: "center",
    marginTop: 12,
  },
  footer: { marginTop: "auto" },
});
