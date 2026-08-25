// The scored payoff — "where you're most at risk", on the reveal.
//
// WHAT IT REPLACED. The reveal's card drew a HARDCODED cubic bezier: the same
// gentle curve for someone losing 8 lb over twelve weeks and someone losing 90
// over two years, with their two numbers pinned to its ends. The file header
// claimed it "draws its line from today's weight down to the goal". The
// numbers were live; the line never was. This is a picture of something real.
//
// WHY A SCORE. Thirty answers went in and five came back out. A score with
// NAMED drivers is what turns the questionnaire into something the user can
// see the shape of — and every driver points at something they can change,
// which is the difference between a warning and a plan. See riskProfile.ts,
// which is also where the honesty rules live.
//
// THE MOTION IS THE ARGUMENT. The ring closes to its value, the number counts
// with it, and the bars grow one after another. Landing them all at once would
// read as a graphic; arriving in sequence reads as a result being worked out.
// Nothing here animates on mount — it waits for the reveal's own draw, so the
// screen has one focal point at a time.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { CountUp } from '../CountUp';
import { useHapticRamp } from '../useHapticRamp';
import { convo } from './convoTokens';
import { typography } from '../../theme/typography';
import type { RiskProfile } from '../../utils/riskProfile';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 118;
const R = 52;
const CIRCUMFERENCE = 2 * Math.PI * R; // 326.7 — the frame's 327

const RING_MS = 1100;
const BAR_MS = 560;
const BAR_STAGGER_MS = 110;

/** Severity colour. Green is a real outcome here, not a courtesy. */
function toneOf(score: number): string {
  if (score >= 70) return '#FF8A3D';
  if (score >= 45) return '#FFB020';
  return '#34C759';
}

function Driver({ label, score, run, index }: { label: string; score: number; run: boolean; index: number }) {
  const grow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!run) return undefined;
    const anim = Animated.timing(grow, {
      toValue: 1,
      duration: BAR_MS,
      delay: index * BAR_STAGGER_MS,
      easing: Easing.out(Easing.cubic),
      // Width percentage, not a transform.
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [run, grow, index]);

  const width = grow.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', `${Math.max(2, score)}%`],
  });

  return (
    <View style={styles.driver}>
      <Text style={styles.driverLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width, backgroundColor: toneOf(score) }]} />
      </View>
    </View>
  );
}

export function RiskPayoff({
  profile,
  run,
  onSettled,
}: {
  profile: RiskProfile;
  run: boolean;
  /** Fires once the ring has closed — the reveal hangs its confetti on this. */
  onSettled?: () => void;
}) {
  const close = useRef(new Animated.Value(0)).current;
  const settled = useRef(false);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  // The tactile beat the goal path used to carry, moved onto the thing that
  // actually animates now. Ends as the ring closes.
  useHapticRamp(run, { durationMs: RING_MS, pulses: 12 });

  useEffect(() => {
    if (!run) return undefined;
    const anim = Animated.timing(close, {
      toValue: 1,
      duration: RING_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (!finished || settled.current) return;
      settled.current = true;
      onSettledRef.current?.();
    });
    return () => anim.stop();
  }, [run, close]);

  const dashoffset = close.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCUMFERENCE, CIRCUMFERENCE * (1 - profile.score / 100)],
  });
  const tone = toneOf(profile.score);

  return (
    <View>
      <View style={styles.ringWrap}>
        <Svg width={SIZE} height={SIZE} viewBox="0 0 120 120">
          <Circle cx={60} cy={60} r={R} fill="none" stroke="rgba(23,20,31,0.10)" strokeWidth={11} />
          <AnimatedCircle
            cx={60}
            cy={60}
            r={R}
            fill="none"
            stroke={tone}
            strokeWidth={11}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashoffset}
            // Start at twelve o'clock, not three.
            transform="rotate(-90 60 60)"
          />
        </Svg>
        <View style={styles.ringCentre} pointerEvents="none">
          <View style={styles.ringRow}>
            {/* Counts WITH the ring rather than after it, so the number and
                the arc are describing the same motion. */}
            {run ? (
              <CountUp value={profile.score} duration={RING_MS} style={styles.ringNum} />
            ) : (
              <Text style={styles.ringNum}>0</Text>
            )}
            <Text style={styles.ringPct}>%</Text>
          </View>
          <Text style={styles.ringCaption}>muscle risk</Text>
        </View>
      </View>

      <View style={styles.drivers}>
        {profile.drivers.map((d, i) => (
          <Driver key={d.key} label={d.label} score={d.score} run={run} index={i} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ringWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 24, height: SIZE },
  ringCentre: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringRow: { flexDirection: 'row', alignItems: 'baseline' },
  ringNum: {
    fontFamily: typography.fonts.heavy,
    fontSize: 31,
    // EXPLICIT, OR THE DIGITS ARE GUILLOTINED (2026-08-25). With no lineHeight
    // RN gives the text a line box from the font's own metrics, and this face
    // at heavy weight has ascenders taller than that box — so the tops of the
    // numerals were sliced clean off inside the ring. 38 is ~1.23x, enough for
    // the ascender at every digit.
    lineHeight: 38,
    letterSpacing: -1,
    color: convo.ink,
  },
  ringPct: { fontFamily: typography.fonts.heavy, fontSize: 16, color: convo.faint },
  ringCaption: {
    fontFamily: typography.fonts.semiBold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: convo.faint,
    marginTop: 1,
  },
  drivers: { marginTop: 22, gap: 11 },
  driver: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  driverLabel: {
    // 132, not 112. "Resistance training" is the longest label in RISK_DRIVERS
    // and measures ~124pt at 12pt semiBold, so the old width truncated it to
    // "Resistance traini…" at DEFAULT type — before Dynamic Type touched it.
    // Fixed rather than content-sized because the bars share a left edge, and
    // that alignment is the point of the row.
    width: 132,
    fontFamily: typography.fonts.semiBold,
    fontSize: 12,
    color: convo.ink,
  },
  track: { flex: 1, height: 7, borderRadius: 999, backgroundColor: '#F0ECE5', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
});
