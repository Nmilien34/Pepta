// Onboarding — Name your companion (T2c). Straight after Meet Pep, while the
// introduction is still on screen: asking later would feel bolted on.
//
// Optional by design. Continue works untouched and the default stays "Pep" —
// this is a flourish, never a gate. Picking a chip fills the field AND the
// bubble echoes the new name immediately, because a name that doesn't come
// back at once reads as a form field rather than a companion.

import React, { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ConvoButton, ConvoScreen, convo } from '../../components';
import { LivingMascot } from '../../components/LivingMascot';
import { typography } from '../../theme/typography';
import {
  COMPANION_NAME_MAX,
  COMPANION_NAME_PRESETS,
  DEFAULT_COMPANION_NAME,
  companionNameForSave,
  randomCompanionName,
} from '../../utils/companion';

export interface NameCompanionScreenProps {
  progress: number;
  onBack?(): void;
  /** Receives undefined when the user kept the default. */
  onContinue(name: string | undefined): void;
}

export function NameCompanionScreen({ progress, onBack, onContinue }: NameCompanionScreenProps) {
  const [name, setName] = useState('');
  // Bumped on every pick so the mascot re-pops — the echo should be felt.
  const [beat, setBeat] = useState(0);
  const lastSpoken = useRef('');

  const shown = name.trim().length > 0 ? name.trim() : DEFAULT_COMPANION_NAME;

  const bubble = useMemo(() => {
    if (name.trim().length === 0) return `I answer to ${DEFAULT_COMPANION_NAME} just fine.`;
    return `${shown} it is 😊`;
  }, [name, shown]);

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

  return (
    <ConvoScreen
      progress={progress}
      onBack={onBack}
      context="Nice to meet you too."
      question="What should I go by"
      questionAccent
      sub={`Totally optional — I answer to ${DEFAULT_COMPANION_NAME} just fine.`}
      footer={<ConvoButton label="Continue" onPress={() => onContinue(companionNameForSave(name))} />}
    >
      <View style={{ marginTop: 18 }}>
        <View
          style={{
            borderWidth: 1.5,
            borderColor: convo.ink,
            borderRadius: 14,
            paddingHorizontal: 15,
            paddingVertical: 4,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <TextInput
            accessibilityLabel="Companion name"
            value={name}
            onChangeText={(next) => speak(next.slice(0, COMPANION_NAME_MAX))}
            placeholder={DEFAULT_COMPANION_NAME}
            placeholderTextColor={convo.faint}
            maxLength={COMPANION_NAME_MAX}
            autoCorrect={false}
            returnKeyType="done"
            style={{
              flex: 1,
              fontFamily: typography.fonts.heavy,
              fontSize: 17,
              color: convo.ink,
              paddingVertical: 11,
            }}
          />
          <Text
            style={{ fontFamily: typography.fonts.bold, fontSize: 12, color: convo.faint }}
          >
            {name.trim().length}/{COMPANION_NAME_MAX}
          </Text>
        </View>

        <ScrollView
          horizontal={false}
          scrollEnabled={false}
          contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 }}
        >
          {COMPANION_NAME_PRESETS.map((preset) => {
            const selected = shown === preset;
            return (
              <Pressable
                key={preset}
                onPress={() => speak(preset === DEFAULT_COMPANION_NAME ? '' : preset)}
                accessibilityRole="button"
                accessibilityLabel={`Name me ${preset}`}
                accessibilityState={{ selected }}
                style={({ pressed }) => ({
                  borderWidth: selected ? 1.5 : 1,
                  borderColor: selected ? convo.ink : convo.hairline,
                  backgroundColor: convo.surface,
                  borderRadius: 999,
                  paddingVertical: 8,
                  paddingHorizontal: 13,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text
                  style={{
                    fontFamily: typography.fonts.bold,
                    fontSize: 13,
                    color: selected ? convo.ink : convo.soft,
                  }}
                >
                  {preset}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable
          onPress={() => speak(randomCompanionName(shown))}
          accessibilityRole="button"
          accessibilityLabel="Surprise me with a name"
          hitSlop={8}
          style={{ alignSelf: 'flex-start', paddingVertical: 10 }}
        >
          <Text
            style={{ fontFamily: typography.fonts.bold, fontSize: 12.5, color: convo.primary }}
          >
            🎲 Surprise me
          </Text>
        </Pressable>
      </View>

      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: 8,
          paddingBottom: 6,
        }}
      >
        <LivingMascot key={beat} pose="idle" size={86} bobSeconds={3.2} />
        <View
          accessibilityLiveRegion="polite"
          style={{
            backgroundColor: convo.surface,
            borderWidth: 1,
            borderColor: convo.hairline,
            borderRadius: 16,
            borderBottomLeftRadius: 5,
            paddingVertical: 10,
            paddingHorizontal: 13,
            marginBottom: 18,
          }}
        >
          <Text style={{ fontFamily: typography.fonts.bold, fontSize: 13.5, color: convo.ink }}>
            {bubble}
          </Text>
        </View>
      </View>
    </ConvoScreen>
  );
}
