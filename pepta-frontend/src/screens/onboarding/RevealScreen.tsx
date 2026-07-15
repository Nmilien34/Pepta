// Reveal — the payoff before the wall. On the same light conversation ground:
// the echo + "Your tracker is ready" type in, then the goal-path card draws its
// line from today's weight down to the goal. The moment it reaches the flag, the
// flag pops, a success haptic thumps, and a confetti burst falls — the plan is
// claimed. Every number is derived live from the user's answers.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Confetti, ConvoButton, ConvoScreen, convo } from '../../components';
import { typography } from '../../theme/typography';
import { formatShortDate } from '../../utils/dateParts';
import type { GoalProjection } from '../../utils/goalProjection';
import type { PlanTargets } from '../../utils/planPreview';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Graph geometry (viewBox 0 0 322 150): a gentle descent from today to goal.
const CURVE = 'M14 24 C 96 44, 196 82, 300 120';
const CURVE_LENGTH = 330; // safely >= the real path length for the dash trick
const ORIGIN = { x: 14, y: 24 };
const DRAW_MS = 1500;

export interface RevealScreenProps {
  progress: number;
  startWeight: number;
  goalWeight: number;
  unit: 'lb' | 'kg';
  targets: PlanTargets;
  projection: GoalProjection;
  onContinue(): void;
}

export function RevealScreen({
  progress,
  startWeight,
  goalWeight,
  unit,
  targets,
  projection,
  onContinue,
}: RevealScreenProps) {
  const [revealed, setRevealed] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
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
        footer={<ConvoButton label="Start today" onPress={onContinue} />}
      >
        <GoalPathCard
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
    </View>
  );
}

interface GoalPathCardProps {
  start: boolean;
  startWeight: number;
  goalWeight: number;
  unit: 'lb' | 'kg';
  dateChip: string | null;
  onArrive(): void;
}

function GoalPathCard({ start, startWeight, goalWeight, unit, dateChip, onArrive }: GoalPathCardProps) {
  const draw = useRef(new Animated.Value(0)).current;
  const flagPop = useRef(new Animated.Value(0)).current;
  const arrived = useRef(false);
  const onArriveRef = useRef(onArrive);
  onArriveRef.current = onArrive;

  useEffect(() => {
    if (!start || arrived.current) return;
    const seq = Animated.sequence([
      // let the card settle in first, then the line finds its way to the goal
      Animated.delay(260),
      Animated.timing(draw, { toValue: 1, duration: DRAW_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
      Animated.spring(flagPop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
    ]);
    seq.start(({ finished }) => {
      if (finished) {
        arrived.current = true;
        onArriveRef.current();
      }
    });
    return () => seq.stop();
  }, [start, draw, flagPop]);

  const dashoffset = draw.interpolate({ inputRange: [0, 1], outputRange: [CURVE_LENGTH, 0] });
  const flagStyle = {
    opacity: flagPop,
    transform: [
      { scale: flagPop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
      { translateY: flagPop.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
    ],
  };

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>
        GOAL PATH{dateChip ? <Text style={{ color: convo.primary }}>{`  ·  ${goalWeight} ${unit} by ${dateChip}`}</Text> : null}
      </Text>

      <View style={styles.graphWrap}>
        <Svg width="100%" height={150} viewBox="0 0 322 150">
          <Defs>
            <LinearGradient id="revealPath" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={convo.primary} />
              <Stop offset="1" stopColor="#E25CC4" />
            </LinearGradient>
          </Defs>
          {/* the faint full route, then the animated draw on top */}
          <Path d={CURVE} stroke={convo.hairline} strokeWidth={2} strokeDasharray="5 7" fill="none" />
          <AnimatedPath
            d={CURVE}
            stroke="url(#revealPath)"
            strokeWidth={3.5}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={CURVE_LENGTH}
            strokeDashoffset={dashoffset}
          />
          <Circle cx={ORIGIN.x} cy={ORIGIN.y} r={5.5} fill={convo.primary} stroke={convo.surface} strokeWidth={2.5} />
        </Svg>

        <Text style={[styles.originLabel, { top: 2, left: 24 }]}>{startWeight} {unit} today</Text>

        <Animated.View style={[styles.flagWrap, flagStyle]}>
          <View style={styles.flag}>
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#B23A93" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M6 21V4M6 4h11l-2 4 2 4H6" />
            </Svg>
          </View>
          <Text style={styles.flagLabel}>{goalWeight} {unit}</Text>
        </Animated.View>
      </View>
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
  chipText: { fontFamily: typography.fonts.semiBold, fontSize: 13.5, color: convo.ink },
});
