// Onboarding — Beat · Where the weight comes from. Two bars: what unmanaged
// loss does to lean mass, and what watching protein + pace is for. It sits
// after medication + dose + frequency, so by the time it lands the user has
// told us what they take and how often — the stat is about THEIR regimen
// rather than a poster on a wall.
//
// The bars build rather than appear. They start at a shared visible floor and
// diverge, so the user watches the grey one climb instead of finding it already
// tall. Each bar fires a haptic as it settles (the heavier one for the bigger
// climb), then their companion speaks with its own two-beat Soft·Soft voice.
//
// The claim is guarded in leanMassBars.ts — read the note there before
// touching any number on this screen.

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { ConvoButton, ConvoScreen, convo } from "../../components";
import { LivingMascot } from "../../components/LivingMascot";
import { useSpeechHaptic } from "../../components/useSpeechHaptic";
import { resolveCompanionName } from "../../utils/companion";
import { IMPACT } from "../../components/useHapticRamp";
import { typography } from "../../theme/typography";
import {
  buildLeanMassBars,
  leanMassSettleMs,
  type LeanMassBar,
} from "./leanMassBars";

const CHART_HEIGHT = 122;

function Bar({ bar, run }: { bar: LeanMassBar; run: boolean }) {
  const grow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!run) return undefined;
    const animation = Animated.timing(grow, {
      toValue: 1,
      delay: bar.delayMs,
      duration: bar.durationMs,
      // Eased at BOTH ends. `out(cubic)` alone leaves at full speed, which
      // reads as a snap no matter how long the duration is; a soft departure
      // and a long tail is what makes a slow climb watchable instead of just
      // slow. Not a full ease-in-out — the front is gentle but not dead, or
      // the bar appears frozen for the first quarter-second.
      easing: Easing.bezier(0.32, 0, 0.24, 1),
      useNativeDriver: false, // height is a layout prop
    });
    animation.start(({ finished }) => {
      if (finished && Platform.OS !== "web") {
        void Haptics.impactAsync(IMPACT[bar.haptic]).catch(() => undefined);
      }
    });
    return () => animation.stop();
  }, [run, grow, bar]);

  const height = grow.interpolate({
    inputRange: [0, 1],
    outputRange: [bar.from * CHART_HEIGHT, bar.height * CHART_HEIGHT],
  });

  // The label does NOT count up with the bar. Tweening 11% → 39% would put
  // percentages on screen that no source supports; only the endpoint is cited.
  // So it fades in over the last third of the climb, when the bar is at the
  // height the number describes.
  const labelIn = grow.interpolate({
    inputRange: [0, 0.66, 1],
    outputRange: [0, 0, 1],
  });

  return (
    <View style={styles.col}>
      <Animated.View style={[styles.bar, { height }]}>
        {bar.key === "managed" ? (
          <LinearGradient
            colors={["#8E6BFF", "#6E4EF0"]}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.barBad]} />
        )}
        {bar.label ? (
          <Animated.Text style={[styles.barLabel, { opacity: labelIn }]}>
            {bar.label}
          </Animated.Text>
        ) : null}
      </Animated.View>
      <Text style={styles.caption}>
        {bar.caption}
        {"\n"}
        <Text style={styles.captionSub}>{bar.captionSub}</Text>
      </Text>
    </View>
  );
}

export interface LeanMassBeatScreenProps {
  progress: number;
  onBack?(): void;
  /** e.g. "Tirzepatide · 5 mg · weekly." */
  context?: string;
  /** The name they gave their companion; falls back to Pep. */
  companionName?: string;
  onContinue(): void;
}

export function LeanMassBeatScreen({
  progress,
  onBack,
  context,
  companionName,
  onContinue,
}: LeanMassBeatScreenProps) {
  const bars = useMemo(() => buildLeanMassBars(), []);
  const name = resolveCompanionName(companionName);
  const [typed, setTyped] = useState(false);
  const [settled, setSettled] = useState(false);
  const pepIn = useRef(new Animated.Value(0)).current;

  // Pep waits for the chart to finish. Speaking over a moving bar would split
  // attention at the exact moment the divergence is meant to land.
  useEffect(() => {
    if (!typed) return undefined;
    const timer = setTimeout(
      () => setSettled(true),
      leanMassSettleMs(bars) + 280,
    );
    return () => clearTimeout(timer);
  }, [typed, bars]);

  useEffect(() => {
    if (!settled) return;
    Animated.spring(pepIn, {
      toValue: 1,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [settled, pepIn]);

  const line = `${name} here. That second bar is my whole job.`;
  useSpeechHaptic(settled ? line : null);

  return (
    <ConvoScreen
      progress={progress}
      onBack={onBack}
      context={context}
      question="Not all the weight you lose is fat"
      questionAccent
      footer={<ConvoButton label="Show me" onPress={onContinue} />}
      onTyped={() => setTyped(true)}
    >
      <View style={styles.card}>
        <View style={styles.bars}>
          {bars.map((bar) => (
            <Bar key={bar.key} bar={bar} run={typed} />
          ))}
        </View>
        <Text style={styles.cite}>
          Up to 39% of the weight lost on a GLP-1 can be lean mass when nobody
          watches for it.
          {"\n"}
          <Text style={styles.citeSource}>
            STEP-1 &amp; SURMOUNT-1 body-composition analyses
          </Text>
        </Text>
      </View>

      {/* Mounted only once it is due, not merely faded in: an
          opacity-0 bubble is still read aloud by VoiceOver, so the
          companion would announce its line before it appears. */}
      {settled ? (
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
          <LivingMascot pose="idle" size={46} bobSeconds={3.2} />
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
    marginTop: 14,
    backgroundColor: convo.surface,
    borderWidth: 1,
    borderColor: convo.hairline,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  bars: {
    flexDirection: "row",
    gap: 18,
    alignItems: "flex-end",
    justifyContent: "center",
    height: CHART_HEIGHT,
    marginTop: 4,
    marginBottom: 8,
  },
  col: {
    flex: 1,
    maxWidth: 120,
    alignItems: "center",
    justifyContent: "flex-end",
    height: "100%",
  },
  bar: {
    width: "100%",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    alignItems: "center",
    paddingTop: 9,
    overflow: "hidden",
  },
  barBad: { backgroundColor: "#E9E7EE" },
  barLabel: {
    fontFamily: typography.fonts.heavy,
    fontSize: 19,
    color: "#5A5866",
  },
  caption: {
    fontFamily: typography.fonts.heavy,
    fontSize: 11.5,
    lineHeight: 15,
    color: convo.soft,
    marginTop: 6,
    textAlign: "center",
  },
  captionSub: { fontFamily: typography.fonts.semiBold },
  cite: {
    fontFamily: typography.fonts.medium,
    fontSize: 10.5,
    lineHeight: 15,
    color: convo.faint,
    textAlign: "center",
    marginTop: 4,
  },
  citeSource: { fontFamily: typography.fonts.medium },
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
