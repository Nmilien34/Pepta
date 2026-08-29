// Onboarding — "Your floor, not your target". The give that lands the instant
// height and weight are in, breaking the second seven-ask run.
//
// WHY HERE. This is the hardest number in the flow to hand over, and until now
// the screen that followed it asked for another one. Answering a weight with a
// weight is what makes the middle of this flow feel like a form. Instead the
// number they just gave comes straight back as something that belongs to them.
//
// THE CHAIN. heightWeight collects it → this screen echoes it ("5′10″, 226
// today.") and derives the floor FROM it → startWeight then echoes the floor
// ("158 g a day. Locked in."). Three screens, one input, each one visibly
// built on the last. That is the cohesion; a static line here would break it.
//
// FLOOR, NOT TARGET — and the title says so. A "target" is something you might
// miss and feel bad about; a floor is the line under which the weight you lose
// stops being fat. Same number, and only one of those framings is useful to
// someone about to eat lunch.
//
// NO CITATION, deliberately. Every other CitedStat in this flow carries a
// study because it states a general fact. This number is arithmetic on THEIR
// body, so a citation would dress a personal calculation as published
// research — CitedStat's `cite` is optional for exactly this case.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ConvoButton, ConvoScreen } from '../../components';
import { CitedStat } from '../../components/onboarding/CitedStat';
import { LivingMascot } from '../../components/LivingMascot';
import { convo } from '../../components/onboarding/convoTokens';
import { typography } from '../../theme/typography';

export interface MuscleFloorScreenProps {
  progress: number;
  onBack?(): void;
  onContinue(): void;
  /** e.g. "5′10″, 226 today." — their own answer, one screen old. */
  context?: string;
  /** Derived from that same weight by proteinFloorG. Never a literal. */
  proteinG: number;
}

export function MuscleFloorScreen({
  progress,
  onBack,
  onContinue,
  context,
  proteinG,
}: MuscleFloorScreenProps) {
  return (
    <ConvoScreen
      progress={progress}
      onBack={onBack}
      context={context}
      question="Your floor, not your target"
      questionAccent
      footer={<ConvoButton label="Got it" onPress={onContinue} />}
    >
      <CitedStat
        style={styles.stat}
        value={`${proteinG} g`}
        line="of protein a day. Below this the scale still moves, but some of what leaves is the muscle you came in with."
        land
      />
      <View style={styles.pepRow}>
        <LivingMascot pose="idle" size={44} />
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>This is the one number I’ll keep an eye on for you.</Text>
        </View>
      </View>
    </ConvoScreen>
  );
}

const styles = StyleSheet.create({
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
