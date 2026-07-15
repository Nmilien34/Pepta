// Onboarding — Beat A · Instrument. Capability, not comfort: their shot answers
// just armed the level model, and the curve draws itself on to prove it. One
// thin purple stroke, no fill. Advance via a single quiet CTA.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ConvoButton, ConvoScreen, convo } from '../../components';
import { typography } from '../../theme/typography';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// A week of estimated medication level: rise after the shot, gentle decay.
const CURVE = 'M4 78 C 30 74, 44 22, 78 16 C 120 9, 168 34, 218 52 C 258 66, 288 74, 306 77';
const CURVE_LENGTH = 340; // slightly over the true path length; the draw still lands clean

function LevelCurve({ armed }: { armed: boolean }) {
  const draw = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!armed) return;
    Animated.timing(draw, { toValue: 1, duration: 600, useNativeDriver: false }).start();
  }, [armed, draw]);
  const dashOffset = draw.interpolate({ inputRange: [0, 1], outputRange: [CURVE_LENGTH, 0] });
  return (
    <View style={styles.panel}>
      <Svg width="100%" height={96} viewBox="0 0 310 96">
        <AnimatedPath
          d={CURVE}
          stroke={convo.primary}
          strokeWidth={2.5}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${CURVE_LENGTH}`}
          strokeDashoffset={dashOffset}
        />
      </Svg>
      <View style={styles.panelRow}>
        <Text style={styles.panelLabel}>shot</Text>
        <Text style={styles.panelLabel}>day 7</Text>
      </View>
    </View>
  );
}

export interface InstrumentBeatScreenProps {
  progress: number;
  onBack?(): void;
  /** e.g. "Tirzepatide · 5 mg · Sundays." */
  context?: string;
  onContinue(): void;
}

export function InstrumentBeatScreen({ progress, onBack, context, onContinue }: InstrumentBeatScreenProps) {
  const [typed, setTyped] = useState(false);
  return (
    <ConvoScreen
      progress={progress}
      onBack={onBack}
      context={context}
      question="Your level model is armed"
      questionAccent
      sub="Every dose you log feeds this curve — you'll always know what's still active in you."
      footer={<ConvoButton label="Good to know" onPress={onContinue} />}
      onTyped={() => setTyped(true)}
    >
      <LevelCurve armed={typed} />
    </ConvoScreen>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: 30,
    borderWidth: 1,
    borderColor: convo.hairline,
    borderRadius: 18,
    backgroundColor: convo.surface,
    paddingVertical: 18,
    paddingHorizontal: 14,
  },
  panelRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 6 },
  panelLabel: { fontFamily: typography.fonts.medium, fontSize: 11.5, color: convo.faint },
});
