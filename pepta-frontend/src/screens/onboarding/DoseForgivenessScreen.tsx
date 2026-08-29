// Onboarding — "A day late won't undo you". The give that lands immediately
// after the dose, breaking the first of the two seven-ask runs.
//
// WHAT IT IS FOR. It answers an anxiety nothing else in the flow touches and
// the user has not voiced yet: what happens if I miss the schedule. They have
// just typed their drug and their dose, so this is the moment the question is
// live — and the answer is genuinely reassuring, which makes it a gift rather
// than an instruction.
//
// THE NUMBER IS THEIR DRUG'S. `halfLifeDays` comes off the medication they
// picked, never a literal. A semaglutide user and a tirzepatide user get
// different numbers, and an oral user gets a much shorter one — which is why
// the screen SKIPS rather than lies when the half-life is short (see
// shouldSkipStep): "a day late won't undo you" is only true of a drug that
// stays in you for days, and it would be a false reassurance about a missed
// dose on anything faster.
//
// It does NOT duplicate `instrument` eight steps later. That one is about
// capability — "you'll always know what's in you". This one is about
// forgiveness. Same curve, different promise.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

/** The stroke's path length. Safely over the real one for the dash trick. */
const CURVE_LENGTH = 320;
const DRAW_MS = 900;
import { ConvoButton, ConvoScreen } from '../../components';
import { CitedStat } from '../../components/onboarding/CitedStat';
import { LivingMascot } from '../../components/LivingMascot';
import { convo } from '../../components/onboarding/convoTokens';
import { typography } from '../../theme/typography';

/** "~5 days" / "~1 day" / "~1.6 days" — never a bare number. */
export function halfLifeLabel(days: number): string {
  const rounded = Number.isInteger(days) ? days : Math.round(days * 10) / 10;
  return `~${rounded} ${rounded === 1 ? 'day' : 'days'}`;
}

export interface DoseForgivenessScreenProps {
  progress: number;
  onBack?(): void;
  onContinue(): void;
  /** e.g. "Tirzepatide · 5 mg." — the regimen echo above the question. */
  context?: string;
  medicationName: string;
  halfLifeDays: number;
}

export function DoseForgivenessScreen({
  progress,
  onBack,
  onContinue,
  context,
  medicationName,
  halfLifeDays,
}: DoseForgivenessScreenProps) {
  // The curve draws itself once the question has finished typing — same gate
  // the lean-mass and instrument beats use. Drawing it under the typewriter
  // would put two things in motion at once and the eye would follow neither.
  const [typed, setTyped] = useState(false);
  const draw = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!typed) return undefined;
    const run = Animated.timing(draw, {
      toValue: 1,
      duration: DRAW_MS,
      easing: Easing.out(Easing.cubic),
      // strokeDashoffset is an SVG prop, not a transform.
      useNativeDriver: false,
    });
    run.start();
    return () => run.stop();
  }, [typed, draw]);

  const dashoffset = draw.interpolate({
    inputRange: [0, 1],
    outputRange: [CURVE_LENGTH, 0],
  });
  // The band and the marker arrive only once the line has reached them, so the
  // shading reads as a consequence of the curve rather than a backdrop.
  const settle = draw.interpolate({ inputRange: [0, 0.72, 1], outputRange: [0, 0, 1] });

  return (
    <ConvoScreen
      progress={progress}
      onBack={onBack}
      context={context}
      question="A day late won’t undo you"
      questionAccent
      footer={<ConvoButton label="That helps" onPress={onContinue} />}
      onTyped={() => setTyped(true)}
    >
      {/* The decay curve with the still-covered window shaded. The point of
          the picture is the SHADING, not the line: it is what makes "late is
          a wobble" visible rather than asserted. */}
      <View style={styles.curve}>
        <Svg viewBox="0 0 290 92" width="100%" height={92}>
          <Defs>
            <LinearGradient id="doseFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={convo.primary} stopOpacity="0.22" />
              <Stop offset="1" stopColor={convo.primary} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <AnimatedRect
            x={150}
            y={0}
            width={86}
            height={92}
            fill={convo.primary}
            opacity={Animated.multiply(settle, 0.07)}
          />
          <AnimatedPath
            d="M6 78 C 40 12, 74 10, 110 26 C 160 48, 210 62, 284 72 L284 92 L6 92 Z"
            fill="url(#doseFade)"
            opacity={settle}
          />
          <AnimatedPath
            d="M6 78 C 40 12, 74 10, 110 26 C 160 48, 210 62, 284 72"
            fill="none"
            stroke={convo.primary}
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeDasharray={CURVE_LENGTH}
            strokeDashoffset={dashoffset}
          />
          {/* The marker sits ON the curve inside the covered band — it is what
              turns the shading from a backdrop into "and here is you". */}
          <AnimatedCircle cx={193} cy={59} r={4.5} fill={convo.primary} opacity={settle} />
        </Svg>
        <View style={styles.axis}>
          <Text style={styles.axisLabel}>shot day</Text>
          <Text style={[styles.axisLabel, styles.axisOn]}>still covered</Text>
        </View>
      </View>

      <CitedStat
        style={styles.stat}
        value={halfLifeLabel(halfLifeDays)}
        line="is how long half of it is still in you. Which is why one shot covers a week, and why a late one is a wobble rather than a reset."
        // Accurate for any drug in the catalog and invented for none: every
        // approved medication has prescribing information.
        cite={`${medicationName} prescribing information`}
        land
      />

      <View style={styles.pepRow}>
        <LivingMascot pose="idle" size={44} />
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>I’ll tell you when it actually matters.</Text>
        </View>
      </View>
    </ConvoScreen>
  );
}

const styles = StyleSheet.create({
  curve: { marginTop: 22 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  axisLabel: {
    fontFamily: typography.fonts.semiBold,
    fontSize: 10.5,
    color: convo.faint,
  },
  axisOn: { color: convo.primary },
  stat: { marginTop: 26 },
  pepRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 26 },
  bubble: {
    backgroundColor: convo.surface,
    borderWidth: 1,
    borderColor: convo.hairline,
    borderRadius: 16,
    borderBottomLeftRadius: 6,
    paddingVertical: 11,
    paddingHorizontal: 14,
    maxWidth: 215,
  },
  bubbleText: {
    fontFamily: typography.fonts.semiBold,
    fontSize: 13.5,
    lineHeight: 19,
    color: convo.ink,
  },
});
