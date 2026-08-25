// Reveal — the payoff before the wall. On the same light conversation ground:
// the echo + "Your tracker is ready" type in, then the goal-path card draws its
// line from today's weight down to the goal. The moment it reaches the flag, the
// flag pops, a success haptic thumps, and a confetti burst falls — the plan is
// claimed. Every number is derived live from the user's answers.
//
// SEQUENCING (2026-08-04, the screen-32 drop): the payoff lands
// UNCONDITIONALLY. Everyone gets the Start today button; for signed-out users
// the tap — a cheap, chosen yes, the same micro-commitment mechanic as the
// warm-up's "See my free offer" — raises the save-your-plan auth sheet OVER
// the still-visible plan. The ask only ever follows a self-initiated step
// toward it, and the user is looking at the thing they'd be protecting while
// they decide. The earlier merge put the identity ask INSIDE the payoff
// moment, which read as three asks in a row (32 questions → identity → pay).

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Linking } from 'react-native';
import { Confetti, ConvoButton, ConvoScreen, convo } from '../../components';
import { RiskPayoff } from '../../components/onboarding/RiskPayoff';
import type { RiskProfile } from '../../utils/riskProfile';
import { ProviderButton } from '../auth/SignInScreen';
import { useProviderSignIn } from '../auth/useProviderSignIn';
import { PRIVACY_URL, TERMS_URL } from '../../config';
import { logRevealClaimTapped } from '../../services/funnelEvents';
import { typography } from '../../theme/typography';
import { formatShortDate } from '../../utils/dateParts';
import type { GoalProjection } from '../../utils/goalProjection';
import type { PlanTargets } from '../../utils/planPreview';



// Graph geometry (viewBox 0 0 322 150): a gentle descent from today to goal.

export interface RevealScreenProps {
  /** Derived from their answers — see utils/riskProfile. */
  risk: RiskProfile;
  progress: number;
  startWeight: number;
  goalWeight: number;
  unit: 'lb' | 'kg';
  targets: PlanTargets;
  projection: GoalProjection;
  /**
   * Everyone gets Start today. Signed-in users advance directly; signed-out
   * users get the save-your-plan sheet on tap — a successful sign-in advances
   * the flow (the navigator watches auth state), a dismissal simply returns
   * to the plan with the button still there.
   */
  authenticated: boolean;
  onContinue(): void;
}

export function RevealScreen({
  risk,
  progress,
  startWeight,
  goalWeight,
  unit,
  targets,
  projection,
  authenticated,
  onContinue,
}: RevealScreenProps) {
  const [revealed, setRevealed] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const dateChip = projection.estimatedDate ? formatShortDate(projection.estimatedDate) : null;

  const handleArrive = () => {
    if (celebrate) return;
    setCelebrate(true);
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const chips = [
    `${targets.proteinG} g protein`,
    `${targets.waterOz} oz water`,
    dateChip ?? `${goalWeight} ${unit}`,
  ];

  return (
    <View style={{ flex: 1 }}>
      <ConvoScreen
        progress={progress}
        context="Dialed in."
        question="Your tracker is ready"
        questionAccent
        onTyped={() => setRevealed(true)}
        footer={
          <ConvoButton
            label="Start today"
            onPress={() => {
              if (authenticated) {
                onContinue();
                return;
              }
              // The claim tap, instrumented separately from registration so
              // the funnel can tell payoff-drop from ask-drop.
              logRevealClaimTapped();
              setSheetOpen(true);
            }}
          />
        }
      >
        <GoalPathCard
          risk={risk}
          start={revealed}
          startWeight={startWeight}
          goalWeight={goalWeight}
          unit={unit}
          dateChip={dateChip}
          onArrive={handleArrive}
        />
        <ProofChips chips={chips} show={celebrate} />
      </ConvoScreen>

      {celebrate ? <Confetti /> : null}

      <SavePlanSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </View>
  );
}

// The save sheet. Rises over the still-visible plan on the Start-today tap.
// Copy rule: this is the user protecting the plan they just watched being
// built — never "create an account" / "sign up". Dismissal (backdrop tap) is
// allowed and just returns to the reveal; a successful sign-in advances the
// flow via the navigator's auth watcher, which unmounts this screen.
function SavePlanSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const { busy, error, showApple, handleApple, handleGoogle } = useProviderSignIn();
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!open) return;
    rise.setValue(0);
    Animated.spring(rise, { toValue: 1, friction: 9, tension: 70, useNativeDriver: true }).start();
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => undefined);
    }
  }, [open, rise]);

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[authStyles.backdrop, { opacity: rise }]}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={onClose} />
      </Animated.View>
      <View style={authStyles.sheetHost} pointerEvents="box-none">
        <Animated.View
          style={[
            authStyles.sheet,
            {
              opacity: rise,
              transform: [
                { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [280, 0] }) },
              ],
            },
          ]}
        >
          <View style={authStyles.grabber} />
          <Text style={authStyles.heading}>Save your plan</Text>
          <Text style={authStyles.privacy}>Your plan is private to you.</Text>
      <View style={{ gap: 9, marginTop: 12 }}>
        <ProviderButton
          variant="google"
          label="Continue with Google"
          busy={busy === 'google'}
          disabled={busy != null}
          onPress={() => void handleGoogle()}
        />
        {showApple ? (
          // Apple's own button — App Review guideline 4 requires the system
          // artwork, not a redrawn logo.
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={999}
            style={{ height: 52, opacity: busy != null && busy !== 'apple' ? 0.5 : 1 }}
            onPress={() => {
              if (busy == null) void handleApple();
            }}
          />
        ) : null}
      </View>
      {error ? <Text style={authStyles.error}>{error}</Text> : null}
          <Text style={authStyles.legal}>
            By continuing you agree to our{' '}
            <Text style={authStyles.legalLink} onPress={() => void Linking.openURL(TERMS_URL)}>
              Terms
            </Text>{' '}
            and{' '}
            <Text style={authStyles.legalLink} onPress={() => void Linking.openURL(PRIVACY_URL)}>
              Privacy Policy
            </Text>
            .
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const authStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(23,20,31,0.28)',
  },
  sheetHost: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: convo.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 34,
    shadowColor: '#171128',
    shadowOffset: { width: 0, height: -12 },
    shadowRadius: 30,
    shadowOpacity: 0.18,
    elevation: 12,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: convo.hairline,
    marginBottom: 16,
  },
  heading: {
    fontFamily: typography.fonts.heavy,
    fontSize: 19,
    letterSpacing: -0.3,
    color: convo.ink,
    textAlign: 'center',
  },
  privacy: {
    fontFamily: typography.fonts.medium,
    fontSize: 12.5,
    color: convo.soft,
    textAlign: 'center',
    marginTop: 5,
    marginBottom: 4,
  },
  error: {
    fontFamily: typography.fonts.semiBold,
    fontSize: 12,
    color: '#C43D3D',
    textAlign: 'center',
    marginTop: 9,
  },
  legal: {
    fontFamily: typography.fonts.medium,
    fontSize: 10,
    lineHeight: 15,
    color: convo.faint,
    textAlign: 'center',
    marginTop: 9,
  },
  legalLink: { textDecorationLine: 'underline', color: convo.soft },
});

interface GoalPathCardProps {
  risk: RiskProfile;
  start: boolean;
  startWeight: number;
  goalWeight: number;
  unit: 'lb' | 'kg';
  dateChip: string | null;
  onArrive(): void;
}

function GoalPathCard({ start, risk, goalWeight, unit, dateChip, onArrive }: GoalPathCardProps) {
  // Latched: arrival fires once per mount, whatever re-renders happen.
  const arrived = useRef(false);
  const onArriveRef = useRef(onArrive);
  onArriveRef.current = onArrive;

  // No local animation left to drive: the card's motion lives in RiskPayoff,
  // and arrival is reported by it. The previous sequence animated a value that
  // nothing read after the hardcoded goal-path curve was removed — it was
  // still firing haptics along a line that was no longer drawn.



  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>
        MUSCLE RISK
        <Text style={{ color: convo.primary }}>{`  ·  ${goalWeight} ${unit} by ${dateChip ?? 'your date'}`}</Text>
      </Text>
      {/* Gated on `run`, the same flag the goal path used, so the payoff still
          lands on the reveal's own beat and the confetti still follows it. */}
      <RiskPayoff
        profile={risk}
        run={start}
        onSettled={() => {
          if (arrived.current) return;
          arrived.current = true;
          onArriveRef.current();
        }}
      />
      <Text style={styles.riskFoot}>
        This is the number Pepta watches. It moves every week you log.
      </Text>
    </View>
  );

}

function ProofChips({ chips, show }: { chips: string[]; show: boolean }) {
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!show) return;
    Animated.timing(rise, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [show, rise]);
  return (
    <Animated.View
      style={[
        styles.chips,
        { opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
      ]}
    >
      {chips.map((c) => (
        <View key={c} style={styles.chip}>
          <Text style={styles.chipText}>{c}</Text>
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 30,
    backgroundColor: convo.surface,
    borderWidth: 1,
    borderColor: convo.hairline,
    borderRadius: 20,
    padding: 16,
    shadowColor: '#171128',
    shadowOffset: { width: 0, height: 14 },
    shadowRadius: 24,
    shadowOpacity: 0.08,
    elevation: 4,
  },
  eyebrow: { fontFamily: typography.fonts.bold, fontSize: 11, letterSpacing: 0.77, color: convo.faint },
  graphWrap: { position: 'relative', marginTop: 8 },
  originLabel: { position: 'absolute', fontFamily: typography.fonts.bold, fontSize: 11, color: convo.faint, marginTop: 34 },
  flagWrap: { position: 'absolute', right: 8, bottom: 6, alignItems: 'center' },
  flag: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FBEAF6',
    borderWidth: 1.5,
    borderColor: '#F0C6E4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagLabel: { fontFamily: typography.fonts.heavy, fontSize: 11.5, color: '#B23A93', marginTop: 5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  chip: {
    backgroundColor: convo.surface,
    borderWidth: 1,
    borderColor: convo.chipBorder,
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 15,
  },
  riskFoot: {
    fontFamily: typography.fonts.medium,
    fontSize: 12,
    lineHeight: 18,
    color: convo.soft,
    textAlign: 'center',
    marginTop: 16,
  },
  chipText: { fontFamily: typography.fonts.semiBold, fontSize: 13.5, color: convo.ink },
});
