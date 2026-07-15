// Onboarding — Welcome in (post-purchase, pre-app). Light returns after the
// wall. The review ask lives HERE, after the user has paid and been welcomed —
// never before the paywall (and never with invented social proof). "Leave a
// rating" opens the system review sheet; "Not now" is quiet and always works.

import React, { useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as StoreReview from 'expo-store-review';
import { ConvoButton, Mascot, Typewriter, convo } from '../../components';
import { typography } from '../../theme/typography';

export interface WelcomeInScreenProps {
  onEnterApp(): void;
}

export function WelcomeInScreen({ onEnterApp }: WelcomeInScreenProps) {
  const [typed, setTyped] = useState(false);
  const [contextDone, setContextDone] = useState(false);

  const handleRate = async () => {
    try {
      if (await StoreReview.isAvailableAsync()) {
        await StoreReview.requestReview();
      }
    } catch {
      // The review sheet is best-effort; never block entry on it.
    }
    onEnterApp();
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.body}>
          <Typewriter
            text="That’s everything."
            speed={14}
            delay={200}
            caret={false}
            haptic={false}
            style={styles.context}
            onDone={() => setContextDone(true)}
          />
          <Text style={styles.question}>
            <Typewriter
              text="Welcome in"
              start={contextDone}
              delay={300}
              style={styles.question}
              onDone={() => setTyped(true)}
            />
            {typed ? <Text style={styles.accent}>{' ■'}</Text> : null}
          </Text>
          {typed ? (
            <Text style={styles.sub}>
              Your tracker is live. If the setup felt right, a rating helps other people on this road find it.
            </Text>
          ) : null}
          <View style={styles.mascot}>
            <Mascot pose="wave" size={132} />
          </View>
        </View>
        <View style={styles.footer}>
          <ConvoButton label="Leave a rating" onPress={handleRate} />
          <Pressable accessibilityRole="button" accessibilityLabel="Not now" onPress={onEnterApp} style={styles.quiet}>
            <Text style={styles.quietText}>Not now</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: convo.ground },
  safe: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 28, paddingTop: 64 },
  context: {
    fontFamily: typography.fonts.bold,
    fontSize: 29,
    lineHeight: 36,
    letterSpacing: -0.75,
    color: convo.dim,
    marginBottom: 28,
  },
  question: {
    fontFamily: typography.fonts.heavy,
    fontSize: 30,
    lineHeight: 37,
    letterSpacing: -0.8,
    color: convo.ink,
  },
  accent: { color: convo.primary, fontSize: 22 },
  sub: { fontFamily: typography.fonts.medium, fontSize: 14.5, lineHeight: 21, color: convo.soft, marginTop: 16, maxWidth: 300 },
  mascot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: 22, paddingBottom: 12, gap: 4 },
  quiet: { alignItems: 'center', paddingVertical: 14 },
  quietText: { fontFamily: typography.fonts.semiBold, fontSize: 14.5, color: convo.faint },
});
