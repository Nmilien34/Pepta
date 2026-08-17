// Screen 1 — the door (design-lab/index.html, "Welcome · carousel"). Five
// peptide cards drifting on their own clocks, the wordmark stepped back to a
// label, the promise in the one serif, and the entry CTA present from the
// first frame.
//
// WHY THE CAROUSEL REPLACED THE TYPING TURN. The previous welcome was a
// ConvoScreen: two lines typed at reading speed, and the footer's opacity was
// bound to `reveal`, which only fires once BOTH finish. Measured, that left
// 2.14s in which the screen had no button, no stat and no sign-in link — the
// first 2.14 seconds of the app, on the screen with the highest drop-off.
// Nothing here waits on an animation.
//
// The 1-in-8 gift did not die with it; it moved to its own turn (step 2) where
// it can carry the reassurance without also carrying consent and sign-in.
//
// GROUND: convo.ground, deliberately, so the handoff to `meetPep` is seamless.
// The warm #F7F5F2 in the design hub is the app-wide redesign and has to land
// as one change across theme.colors.bg AND convo.ground, not just here.

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  Linking,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { ConvoGround, Mascot, convo } from '../../components';
import { PRIVACY_URL, TERMS_URL } from '../../config';
import { typography } from '../../theme/typography';

// Static imports, not require(): Metro treats them identically, and only the
// import form goes through the resolver that lets tests stub binary assets.
import penLight from '../../../assets/welcome/pen-light.jpg';
import penDark from '../../../assets/welcome/pen-dark.jpg';
import pills from '../../../assets/welcome/pills.jpg';
import penBlue from '../../../assets/welcome/pen-blue.jpg';
import vial from '../../../assets/welcome/vial.jpg';

export interface WelcomeScreenProps {
  onContinue(): void;
  /** Returning user tapping "Already have an account? Sign in". */
  onSignIn(): void;
}

interface Card {
  source: ImageSourcePropType;
  width: number;
  height: number;
  /** Horizontal offset from centre. */
  x: number;
  rotate: number;
  opacity: number;
  /** Own clock, so the deck breathes instead of marching. */
  seconds: number;
  /** Negative, so cards are already out of phase on first paint. */
  offsetSeconds: number;
}

// Back-to-front: the outer pair paints first so the hero sits on top.
const DECK: readonly Card[] = [
  { source: penLight, width: 96, height: 124, x: -170, rotate: -15, opacity: 0.5, seconds: 4.6, offsetSeconds: -1.1 },
  { source: penDark, width: 96, height: 124, x: 170, rotate: 15, opacity: 0.5, seconds: 4.9, offsetSeconds: -2.4 },
  { source: pills, width: 128, height: 164, x: -122, rotate: -9, opacity: 0.8, seconds: 4.2, offsetSeconds: -0.5 },
  { source: penBlue, width: 128, height: 164, x: 122, rotate: 9, opacity: 0.8, seconds: 4.4, offsetSeconds: -1.8 },
  { source: vial, width: 176, height: 226, x: 0, rotate: 0, opacity: 1, seconds: 3.8, offsetSeconds: 0 },
];

const LIFT = 13;

/** One drifting card. Each runs its own loop rather than sharing a driver. */
function FloatingCard({ card }: { card: Card }) {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const half = (card.seconds * 1000) / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: half, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: half, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    // A negative delay is not expressible, so the phase offset is applied as a
    // positive wait before this card's loop starts. Same visual result: the
    // deck is never in step.
    const wait = setTimeout(() => loop.start(), Math.abs(card.offsetSeconds) * 1000);
    return () => {
      clearTimeout(wait);
      loop.stop();
    };
  }, [drift, card.seconds, card.offsetSeconds]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.card,
        {
          width: card.width,
          height: card.height,
          opacity: card.opacity,
          transform: [
            { translateX: card.x },
            { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -LIFT] }) },
            { rotate: `${card.rotate}deg` },
          ],
        },
      ]}
    >
      <Image source={card.source} style={styles.cardImage} resizeMode="cover" />
    </Animated.View>
  );
}

/**
 * The entry CTA — the glass pane from the design (.g3), rebuilt in RN.
 *
 * expo-blur is not in the binary, so the backdrop blur is the one property
 * that cannot be reproduced. Everything else is 1:1, and the blur was the
 * least of it: on an opaque ground it contributes almost nothing, whereas the
 * rim and the sheen are what actually read as glass.
 *
 * The rim is a real gradient border — bright white at the top-left, fading
 * through nothing, ending purple at the bottom-right — done by painting the
 * gradient full-bleed and insetting the fill by its width. A uniform
 * borderColor cannot express that, and a hard band reads as a painted stripe
 * rather than an edge catching light.
 */
function GetStartedButton({ onPress }: { onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Get started"
      onPress={() => {
        if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
    >
      {/* Rim: linear-gradient(150deg, …) painted edge-to-edge. */}
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.85)',
          'rgba(255,255,255,0.20)',
          'rgba(255,255,255,0.06)',
          'rgba(70,44,170,0.50)',
        ]}
        locations={[0, 0.42, 0.66, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.ctaInner}>
        {/* The pane itself. */}
        <LinearGradient
          colors={['rgba(108,80,240,0.90)', 'rgba(76,48,196,0.88)']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Soft inner shadow along the bottom — the spec's inset 0 -7px 14px.
            A flat band here is what made the first attempt look solid. */}
        <LinearGradient
          colors={['rgba(46,26,120,0)', 'rgba(46,26,120,0.42)']}
          style={styles.ctaFloor}
          pointerEvents="none"
        />
        {/* Sheen: a diagonal band of light across the top-left of the pane. */}
        <View pointerEvents="none" style={styles.ctaSheenWrap}>
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.26)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
        {/* Bright specular line just inside the top edge. */}
        <View pointerEvents="none" style={styles.ctaTopEdge} />
        <Text style={styles.ctaLabel}>Get started</Text>
      </View>
    </Pressable>
  );
}

export function WelcomeScreen({ onContinue, onSignIn }: WelcomeScreenProps) {
  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <ConvoGround />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.deck}>
          {DECK.map((card, i) => (
            <FloatingCard key={i} card={card} />
          ))}
        </View>

        <View style={styles.foot}>
          <View style={styles.mark}>
            <Mascot size={20} />
            <Text style={styles.wordmark}>Pepta</Text>
          </View>

          <Text style={styles.promise}>Know exactly where you stand.</Text>
          <Text style={styles.subline}>
            Every shot, what it leaves in you, and what your body does next — tracked in one place.
          </Text>

          <GetStartedButton onPress={onContinue} />

          {/* Consent rides the CTA rather than owning a turn. Links stay live. */}
          <Text style={styles.legal}>
            By continuing you agree to our{' '}
            <Text
              accessibilityRole="link"
              accessibilityLabel="Terms of Service"
              style={styles.legalLink}
              onPress={() => void Linking.openURL(TERMS_URL)}
            >
              Terms
            </Text>{' '}
            and{' '}
            <Text
              accessibilityRole="link"
              accessibilityLabel="Privacy Policy"
              style={styles.legalLink}
              onPress={() => void Linking.openURL(PRIVACY_URL)}
            >
              Privacy Policy
            </Text>
            . Your health data is encrypted, never sold, and yours to delete anytime.
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            onPress={onSignIn}
            hitSlop={{ top: 12, bottom: 16, left: 40, right: 40 }}
            style={styles.quiet}
          >
            <Text style={styles.quietText}>
              Already have an account?{' '}
              <Text style={{ color: convo.ink, fontFamily: typography.fonts.bold }}>Sign in</Text>
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: convo.ground },
  safe: { flex: 1 },
  deck: { flex: 1, minHeight: 300, alignItems: 'center', justifyContent: 'center' },
  card: {
    position: 'absolute',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: convo.surface,
    shadowColor: '#17141F',
    shadowOpacity: 0.28,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  cardImage: { width: '100%', height: '100%' },

  foot: { paddingHorizontal: 26, paddingBottom: 32 },
  mark: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  wordmark: {
    fontFamily: typography.fonts.bold,
    fontSize: 16,
    letterSpacing: -0.1,
    color: convo.soft,
  },
  // The one serif. Different family AND weight from the wordmark above it, so
  // the two stop reading as a single block.
  promise: {
    fontFamily: typography.fonts.serif,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.5,
    color: convo.ink,
    textAlign: 'center',
    marginTop: 14,
  },
  subline: {
    fontFamily: typography.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: convo.soft,
    textAlign: 'center',
    marginTop: 9,
    maxWidth: 270,
    alignSelf: 'center',
  },

  cta: {
    height: 56,
    borderRadius: 28,
    marginTop: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#462CAA',
    shadowOpacity: 0.5,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  ctaPressed: { opacity: 0.9 },
  // Inset by the rim's width, so the gradient behind it reads as a border.
  ctaInner: {
    ...StyleSheet.absoluteFillObject,
    margin: 1.2,
    borderRadius: 26.8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaFloor: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 16 },
  // left -14%, width 58%, height 260%, rotate 22deg — the spec's ::after.
  ctaSheenWrap: {
    position: 'absolute',
    left: '-14%',
    top: '-120%',
    width: '58%',
    height: '260%',
    transform: [{ rotate: '22deg' }],
  },
  ctaTopEdge: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: 1,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  ctaLabel: {
    fontFamily: typography.fonts.bold,
    fontSize: 16.5,
    letterSpacing: -0.17,
    color: convo.onPrimary,
  },

  legal: {
    fontFamily: typography.fonts.medium,
    fontSize: 10.5,
    lineHeight: 15,
    color: convo.faint,
    textAlign: 'center',
    paddingHorizontal: 4,
    paddingTop: 12,
  },
  legalLink: {
    fontFamily: typography.fonts.semiBold,
    color: convo.soft,
    textDecorationLine: 'underline',
  },
  quiet: { alignItems: 'center', paddingTop: 9, paddingBottom: 4 },
  quietText: { fontFamily: typography.fonts.medium, fontSize: 13.5, color: convo.soft },
});
