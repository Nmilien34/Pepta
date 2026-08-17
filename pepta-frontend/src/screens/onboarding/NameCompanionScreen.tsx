// Onboarding — Name your companion (T2c). Straight after Meet Pep, while the
// introduction is still on screen: asking later would feel bolted on.
//
// Optional by design. Continue works untouched and the default stays "Pep" —
// this is a flourish, never a gate.
//
// REWORKED 2026-08-17. The old layout offered four ways to do one optional
// thing — a field, thirteen chips over four rows, a dice link, and a mascot in
// a speech bubble at the very bottom — and buried the thing being named
// underneath all of it. Now the mascot is the subject and wears the name, so
// you watch it change as you choose. Six chips, with the die as the seventh:
// it reveals the seven names that are NOT on screen, which is the only way a
// surprise can be a surprise.

import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { ConvoButton, ConvoScreen, convo } from '../../components';
import { LivingMascot } from '../../components/LivingMascot';
import { typography } from '../../theme/typography';
import {
  COMPANION_CHIP_NAMES,
  COMPANION_NAME_MAX,
  DEFAULT_COMPANION_NAME,
  companionNameForSave,
  surpriseCompanionName,
} from '../../utils/companion';

export interface NameCompanionScreenProps {
  progress: number;
  onBack?(): void;
  /** Receives undefined when the user kept the default. */
  onContinue(name: string | undefined): void;
}

/** The die: one full turn per roll, so the reveal has a beat before it lands. */
function RollingDie({ spin }: { spin: Animated.Value }) {
  return (
    <Animated.Text
      style={[
        styles.die,
        {
          transform: [
            {
              rotate: spin.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '360deg'],
              }),
            },
          ],
        },
      ]}
    >
      🎲
    </Animated.Text>
  );
}

export function NameCompanionScreen({ progress, onBack, onContinue }: NameCompanionScreenProps) {
  const [name, setName] = useState('');
  // Bumped on every pick so the mascot re-pops — the echo should be felt.
  const [beat, setBeat] = useState(0);
  // Names the die has already produced. Kept so a roll never repeats itself
  // until the whole pool has been seen.
  const rolled = useRef<Set<string>>(new Set());
  const lastSpoken = useRef('');
  const spin = useRef(new Animated.Value(0)).current;

  const shown = name.trim().length > 0 ? name.trim() : DEFAULT_COMPANION_NAME;

  const speak = (next: string) => {
    setName(next);
    setBeat((b) => b + 1);
    if (Platform.OS !== 'web' && next !== lastSpoken.current) {
      lastSpoken.current = next;
      // The companion's own voice — two soft beats, matching useSpeechHaptic.
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => undefined);
      setTimeout(
        () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => undefined),
        110,
      );
    }
  };

  const roll = () => {
    const next = surpriseCompanionName(shown, rolled.current);
    rolled.current.add(next);
    spin.setValue(0);
    Animated.timing(spin, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    speak(next);
  };

  const chips = useMemo(() => COMPANION_CHIP_NAMES, []);

  return (
    <ConvoScreen
      progress={progress}
      onBack={onBack}
      context="Nice to meet you too."
      question="What should I go by?"
      footer={
        <ConvoButton label="Continue" onPress={() => onContinue(companionNameForSave(name))} />
      }
    >
      {/* The subject, wearing the answer. */}
      <View style={styles.stage}>
        <LivingMascot key={beat} pose="idle" size={108} bobSeconds={3.2} />
        <Text style={styles.chosen}>{shown}</Text>
        <Text style={styles.optional}>
          Totally optional — I answer to {DEFAULT_COMPANION_NAME} just fine.
        </Text>
      </View>

      <View style={styles.field}>
        <TextInput
          accessibilityLabel="Companion name"
          value={name}
          onChangeText={(next) => speak(next.slice(0, COMPANION_NAME_MAX))}
          placeholder="Type a name"
          placeholderTextColor={convo.faint}
          maxLength={COMPANION_NAME_MAX}
          autoCorrect={false}
          returnKeyType="done"
          style={styles.input}
        />
        {/* The counter earns its place only once there is something to count. */}
        {name.trim().length > 0 ? (
          <Text style={styles.count}>
            {name.trim().length}/{COMPANION_NAME_MAX}
          </Text>
        ) : null}
      </View>

      <View style={styles.chips}>
        {chips.map((preset) => {
          const selected = shown === preset;
          return (
            <Pressable
              key={preset}
              onPress={() => speak(preset === DEFAULT_COMPANION_NAME ? '' : preset)}
              accessibilityRole="button"
              accessibilityLabel={`Name me ${preset}`}
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipSelected,
                pressed && styles.chipPressed,
              ]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{preset}</Text>
            </Pressable>
          );
        })}

        {/* Seventh chip rather than a link below: it is one of the ways to
            answer, not a footnote to them. */}
        <Pressable
          onPress={roll}
          accessibilityRole="button"
          accessibilityLabel="Surprise me with a name"
          style={({ pressed }) => [styles.chip, styles.chipSurprise, pressed && styles.chipPressed]}
        >
          <RollingDie spin={spin} />
          <Text style={[styles.chipText, styles.chipTextSurprise]}>Surprise me</Text>
        </Pressable>
      </View>
    </ConvoScreen>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', marginTop: 18 },
  chosen: {
    fontFamily: typography.fonts.heavy,
    fontSize: 22,
    letterSpacing: -0.4,
    color: convo.ink,
    marginTop: 6,
  },
  optional: {
    fontFamily: typography.fonts.medium,
    fontSize: 12.5,
    color: convo.soft,
    marginTop: 5,
    textAlign: 'center',
  },

  field: {
    borderWidth: 1.5,
    borderColor: convo.ink,
    // A shade warmer than the ground, so the field reads as somewhere to type
    // rather than an outline drawn on the background.
    backgroundColor: convo.alt,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
  },
  input: {
    flex: 1,
    fontFamily: typography.fonts.heavy,
    fontSize: 17,
    color: convo.ink,
    paddingVertical: 11,
  },
  count: { fontFamily: typography.fonts.bold, fontSize: 12, color: convo.faint },

  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 12,
    justifyContent: 'center',
  },
  chip: {
    borderWidth: 1,
    borderColor: convo.hairline,
    backgroundColor: convo.surface,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  // Selection is neutral ink, never purple (the app's OptionCard convention).
  chipSelected: { borderWidth: 1.5, borderColor: convo.ink },
  chipPressed: { opacity: 0.6 },
  chipSurprise: { borderColor: 'rgba(124,92,252,0.35)' },
  chipText: { fontFamily: typography.fonts.bold, fontSize: 13, color: convo.soft },
  chipTextSelected: { color: convo.ink },
  chipTextSurprise: { color: convo.primary },
  die: { fontSize: 13 },
});
