// Screen 1 — The gift (T1). The app is alive from the very first open: the
// greeting types itself at reading speed with haptic ticks, then gives before
// it asks — the 1-in-8 stat (cited), the faces on the same road, and only then
// the entry CTA. Both CTAs lead to the provider sign-in screen.

import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CitedStat, ConvoButton, ConvoScreen, convo } from '../../components';
import { typography } from '../../theme/typography';

export interface WelcomeScreenProps {
  onContinue(): void;
}

const FACES = [
  { initial: 'M', tone: '#EAD9C4' },
  { initial: 'J', tone: '#D4E3D2' },
  { initial: 'R', tone: '#DCD2EE' },
  { initial: 'T', tone: '#CFE0EA' },
  { initial: 'S', tone: '#EADFD0' },
];

export function WelcomeScreen({ onContinue }: WelcomeScreenProps) {
  const [typed, setTyped] = useState(false);

  return (
    <ConvoScreen
      progress={1 / 35}
      context="Hi. Before anything else, one thing."
      question="You’re not doing this alone."
      onTyped={() => {
        setTyped(true);
        // The stat lands with the thump as it reveals.
        if (Platform.OS !== 'web') {
          setTimeout(() => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 220);
        }
      }}
      footer={
        <View style={{ gap: 4 }}>
          <ConvoButton label="I’m ready" onPress={onContinue} />
          <Pressable accessibilityRole="button" accessibilityLabel="Sign in" onPress={onContinue} style={styles.quiet}>
            <Text style={styles.quietText}>
              Already have an account? <Text style={{ color: convo.ink, fontFamily: typography.fonts.bold }}>Sign in</Text>
            </Text>
          </Pressable>
        </View>
      }
    >
      {typed ? (
        <View style={styles.stat}>
          <CitedStat
            value="1 in 8"
            line="American adults has taken a GLP-1. Millions are on this exact road with you."
            cite="KFF Health Tracking Poll, May 2024"
          />
          <View style={styles.faces}>
            {FACES.map((face, i) => (
              <View key={face.initial} style={[styles.face, { backgroundColor: face.tone, marginLeft: i === 0 ? 0 : -8 }]}>
                <Text style={styles.faceText}>{face.initial}</Text>
              </View>
            ))}
            <Text style={styles.facesMore}>15 million+ right now</Text>
          </View>
        </View>
      ) : null}
    </ConvoScreen>
  );
}

const styles = StyleSheet.create({
  stat: { paddingTop: 44 },
  faces: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  face: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: convo.ground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceText: { fontFamily: typography.fonts.bold, fontSize: 12, color: convo.ink },
  facesMore: { fontFamily: typography.fonts.semiBold, fontSize: 12.5, color: convo.soft, marginLeft: 10 },
  quiet: { alignItems: 'center', paddingVertical: 13 },
  quietText: { fontFamily: typography.fonts.medium, fontSize: 13.5, color: convo.soft },
});
