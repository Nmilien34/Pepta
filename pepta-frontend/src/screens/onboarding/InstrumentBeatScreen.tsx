// Onboarding — Beat A · Instrument. Capability, not comfort: their shot answers
// just armed the level model, and the curve draws itself on to prove it.
//
// The design frame originally specified "no fill under the line — one thin
// purple stroke". That was written when this was the only chart in the flow;
// the lean-mass and symptom-week beats since established a house style where a
// drawn curve carries a soft purple area under it. A bare stroke now reads as
// unfinished next to them, so the fill is in and the design frame's spec line
// was updated to match rather than left contradicting the code.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from 'react-native-svg';
import { ConvoButton, ConvoScreen, convo } from '../../components';
import { typography } from '../../theme/typography';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

// A week of estimated medication level: rise after the shot, gentle decay.
const CURVE = 'M4 78 C 30 74, 44 22, 78 16 C 120 9, 168 34, 218 52 C 258 66, 288 74, 306 77';
// Measured with getTotalLength() (336.6), not estimated. It was 340 — over by
// enough that the first ~1% of the draw rendered nothing before the line moved.
const CURVE_LENGTH = 337;
// Closes the stroke down to the baseline and back, for the area underneath.
const AREA = `${CURVE} L 306 92 L 4 92 Z`;
// Where the stroke has actually reached, per fraction of path length, sampled
// off the real curve. The fill is revealed by a clip sweeping right, and a
// linear sweep would run ahead of the line it is meant to sit under.
const CLIP_X = {
  inputRange: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
  outputRange: [4, 30.1, 51.4, 80.1, 113.6, 146.2, 177.8, 209.2, 241, 273.2, 306],
};
// Peak of the modelled curve — the moment most of the dose is on board.
const PEAK = { x: 93.5, y: 14.8 };

function LevelCurve({ armed }: { armed: boolean }) {
  const draw = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!armed) return;
    Animated.timing(draw, { toValue: 1, duration: 600, useNativeDriver: false }).start();
  }, [armed, draw]);
  const dashOffset = draw.interpolate({ inputRange: [0, 1], outputRange: [CURVE_LENGTH, 0] });
  const clipWidth = draw.interpolate({
    inputRange: [...CLIP_X.inputRange],
    outputRange: [...CLIP_X.outputRange],
  });
  return (
    <View style={styles.panel}>
      <Svg width="100%" height={96} viewBox="0 0 310 96">
        <Defs>
          <ClipPath id="levelSweep">
            <AnimatedRect x={0} y={0} width={clipWidth} height={96} />
          </ClipPath>
        </Defs>
        {/* <G>, never a Fragment — react-native-svg walks children for SVG types */}
        <G clipPath="url(#levelSweep)">
          <Path d={AREA} fill="rgba(124,92,252,0.10)" />
          <Circle cx={PEAK.x} cy={PEAK.y} r={4} fill={convo.primary} />
        </G>
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
      question="Now you’ll know what’s in you"
      questionAccent
      sub="Every dose you log feeds this curve, so you'll always know what's still active in you."
      footer={<ConvoButton label="That’s useful" onPress={onContinue} />}
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
