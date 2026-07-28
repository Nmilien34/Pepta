// Onboarding — Beat · Your week has a shape. Sits immediately after the side
// effects turn: they name what worries them, then it gets drawn.
//
// The curve traces itself slowly, eased at both ends, and the fill follows the
// line via an animated clip so the shaded area never runs ahead of the stroke.
// The two on-chart labels fade in only once the line has passed them — a PEAK
// marker over empty space would point at nothing.
//
// The card is deliberately almost wordless: title, curve, axis, citation. The
// paragraph that used to sit under it is gone; the two annotations do that job
// and Pep's line carries the promise.
//
// READ symptomWeek.ts BEFORE CHANGING ANY OF THIS — in particular the note on
// why there is only one curve.

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  Line,
  Path,
  Rect,
} from "react-native-svg";
import * as Haptics from "expo-haptics";
import type { SideEffectType } from "@pepta/shared";
import { ConvoButton, ConvoScreen, convo } from "../../components";
import { LivingMascot } from "../../components/LivingMascot";
import { useSpeechHaptic } from "../../components/useSpeechHaptic";
import { IMPACT } from "../../components/useHapticRamp";
import { typography } from "../../theme/typography";
import {
  CLIP_X_BY_FRACTION,
  CURVE_LENGTH,
  CURVE_PATH,
  DRAW_DURATION_MS,
  EASING_LABEL_AT,
  PEAK_LABEL_AT,
  drawMarks,
  symptomWeekTitle,
} from "./symptomWeek";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

const CHART_H = 152;
const VIEW_W = 300;
const AREA_PATH = `${CURVE_PATH} L 292 112 L 8 112 Z`;

function Curve({ run }: { run: boolean }) {
  const draw = useRef(new Animated.Value(0)).current;
  const fired = useRef(new Set<number>());

  useEffect(() => {
    if (!run) return undefined;
    const marks = drawMarks();
    const listener = draw.addListener(({ value }) => {
      for (const mark of marks) {
        if (value >= mark.at && !fired.current.has(mark.at)) {
          fired.current.add(mark.at);
          if (Platform.OS !== "web") {
            void Haptics.impactAsync(IMPACT[mark.haptic]).catch(
              () => undefined,
            );
          }
        }
      }
    });
    const animation = Animated.timing(draw, {
      toValue: 1,
      duration: DRAW_DURATION_MS,
      // Eased at both ends, same reasoning as the lean-mass bars: a curve that
      // leaves at full speed reads as a snap however long the duration is.
      easing: Easing.bezier(0.32, 0, 0.24, 1),
      useNativeDriver: false, // strokeDashoffset / clip width are not native props
    });
    animation.start();
    return () => {
      draw.removeListener(listener);
      animation.stop();
    };
  }, [run, draw]);

  const dashOffset = draw.interpolate({
    inputRange: [0, 1],
    outputRange: [CURVE_LENGTH, 0],
  });
  // The clip tracks where the STROKE actually is, not a linear sweep — see the
  // note on CLIP_X_BY_FRACTION. Without it the shading leads its own outline.
  const clipWidth = draw.interpolate({
    inputRange: [...CLIP_X_BY_FRACTION.inputRange],
    outputRange: [...CLIP_X_BY_FRACTION.outputRange],
  });
  const peakIn = draw.interpolate({
    inputRange: [PEAK_LABEL_AT, Math.min(PEAK_LABEL_AT + 0.1, 1)],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const easingIn = draw.interpolate({
    inputRange: [EASING_LABEL_AT, 1],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.chart}>
      <Svg
        width="100%"
        height={CHART_H}
        viewBox={`0 0 ${VIEW_W} 140`}
        preserveAspectRatio="none"
      >
        <Defs>
          <ClipPath id="sweep">
            <AnimatedRect x={0} y={0} width={clipWidth} height={140} />
          </ClipPath>
        </Defs>
        <Rect
          x={46}
          y={8}
          width={80}
          height={104}
          rx={7}
          fill="rgba(124,92,252,0.08)"
        />
        <Line
          x1={8}
          y1={40}
          x2={292}
          y2={40}
          stroke="rgba(23,20,31,0.07)"
          strokeWidth={1}
          strokeDasharray="3 5"
        />
        <Line
          x1={8}
          y1={76}
          x2={292}
          y2={76}
          stroke="rgba(23,20,31,0.07)"
          strokeWidth={1}
          strokeDasharray="3 5"
        />
        {/* <G>, never a Fragment — react-native-svg walks children for SVG types */}
        <G clipPath="url(#sweep)">
          <Path d={AREA_PATH} fill="rgba(124,92,252,0.10)" />
          <Circle cx={83} cy={23} r={4} fill={convo.primary} />
          <Circle cx={292} cy={102} r={4.5} fill={convo.primary} />
        </G>
        <AnimatedPath
          d={CURVE_PATH}
          stroke={convo.primary}
          strokeWidth={2.8}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${CURVE_LENGTH}`}
          strokeDashoffset={dashOffset}
        />
        <Line
          x1={8}
          y1={14}
          x2={8}
          y2={112}
          stroke="rgba(124,92,252,0.35)"
          strokeWidth={1.5}
          strokeDasharray="3 4"
        />
        <Line
          x1={8}
          y1={112}
          x2={292}
          y2={112}
          stroke="rgba(23,20,31,0.16)"
          strokeWidth={1.5}
        />
      </Svg>
      <Animated.View style={[styles.peakLabel, { opacity: peakIn }]}>
        <Text style={styles.peakText}>PEAK</Text>
      </Animated.View>
      <Animated.View style={[styles.easingLabel, { opacity: easingIn }]}>
        <Text style={styles.easingText}>EASING</Text>
      </Animated.View>
    </View>
  );
}

export interface SymptomWeekBeatScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  /** Already resolved by the navigator via symptomForWeekBeat. */
  effect: SideEffectType;
  onContinue(): void;
}

export function SymptomWeekBeatScreen({
  progress,
  onBack,
  context,
  effect,
  onContinue,
}: SymptomWeekBeatScreenProps) {
  const [typed, setTyped] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const pepIn = useRef(new Animated.Value(0)).current;
  const title = useMemo(() => symptomWeekTitle(effect), [effect]);

  useEffect(() => {
    if (!typed) return undefined;
    const timer = setTimeout(() => setDrawn(true), DRAW_DURATION_MS + 260);
    return () => clearTimeout(timer);
  }, [typed]);

  useEffect(() => {
    if (!drawn) return;
    Animated.spring(pepIn, {
      toValue: 1,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [drawn, pepIn]);

  // No name in this line: the companion introduced itself on the lean-mass
  // beat and is on screen here, so repeating it costs a third bubble line and
  // pushes the CTA off a small phone.
  const line = "I can’t flatten it. But I’ll show you yours.";
  useSpeechHaptic(drawn ? line : null);

  return (
    <ConvoScreen
      progress={progress}
      onBack={onBack}
      context={context}
      question="Your week has a shape"
      questionAccent
      footer={<ConvoButton label="Show me mine" onPress={onContinue} />}
      onTyped={() => setTyped(true)}
    >
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Curve run={typed} />
        <View style={styles.axis}>
          <Text style={styles.axisText}>Shot day</Text>
          <Text style={styles.axisText}>Day 7</Text>
        </View>
        <Text style={styles.cite}>STEP-1 &amp; SURMOUNT-1 safety analyses</Text>
      </View>

      {/* Mounted only once it is due, not merely faded in: an
          opacity-0 bubble is still read aloud by VoiceOver, so the
          companion would announce its line before it appears. */}
      {drawn ? (
        <Animated.View
          style={[
            styles.pepRow,
            {
              opacity: pepIn,
              transform: [
                {
                  translateY: pepIn.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <LivingMascot pose="idle" size={46} bobSeconds={3.4} />
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>{line}</Text>
          </View>
        </Animated.View>
      ) : null}
    </ConvoScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    backgroundColor: convo.surface,
    borderWidth: 1,
    borderColor: convo.hairline,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 10,
  },
  title: {
    fontFamily: typography.fonts.heavy,
    fontSize: 12.5,
    color: convo.ink,
    textAlign: "center",
    letterSpacing: -0.1,
  },
  chart: { position: "relative", marginTop: 8 },
  peakLabel: {
    position: "absolute",
    top: 1,
    left: "28.7%",
    transform: [{ translateX: -18 }],
  },
  peakText: {
    fontFamily: typography.fonts.heavy,
    fontSize: 8.5,
    letterSpacing: 0.4,
    color: convo.primary,
  },
  easingLabel: { position: "absolute", bottom: 48, right: 4 },
  easingText: {
    fontFamily: typography.fonts.heavy,
    fontSize: 8.5,
    letterSpacing: 0.4,
    color: convo.faint,
  },
  axis: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 3,
    paddingHorizontal: 2,
  },
  axisText: {
    fontFamily: typography.fonts.heavy,
    fontSize: 10,
    color: convo.faint,
  },
  cite: {
    fontFamily: typography.fonts.medium,
    fontSize: 9.5,
    lineHeight: 13,
    color: convo.faint,
    textAlign: "center",
    marginTop: 7,
  },
  pepRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 9,
    marginTop: 10,
  },
  bubble: {
    flex: 1,
    backgroundColor: convo.surface,
    borderWidth: 1,
    borderColor: convo.hairline,
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  bubbleText: {
    fontFamily: typography.fonts.bold,
    fontSize: 14.5,
    lineHeight: 20,
    color: convo.ink,
  },
});
