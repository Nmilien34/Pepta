// Onboarding — Welcome in (post-purchase, pre-app). Light returns after the
// wall. The review invitation lives HERE, after the user has paid and been
// welcomed — never before the paywall, and never with invented social proof.
// "Not now" is quiet and always works.
//
// THIS BUTTON OPENS THE APP STORE COMPOSER, NOT THE SYSTEM SHEET (2026-08-21).
// It used to call StoreReview.requestReview() directly, which was wrong twice
// over. iOS caps that prompt at three per user per 365 days and silently drops
// the rest, so the handler could resolve having shown nothing at all and then
// drop the user into the app — a button that does nothing. And because it
// bypassed services/reviewPrompt.ts it spent one of those three off the books,
// leaving the earned streak_3 ask to fire believing it was the first. The
// deep link always opens the composer and costs none of the three.

import React, { useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ConvoButton, Mascot, Typewriter, convo } from '../../components';
import { WRITE_REVIEW_URL, openAppStore } from '../../services/appUpdate';
import { typography } from '../../theme/typography';

export interface WelcomeInScreenProps {
  onEnterApp(): void;
}

export function WelcomeInScreen({ onEnterApp }: WelcomeInScreenProps) {
  const [typed, setTyped] = useState(false);
  const [contextDone, setContextDone] = useState(false);

  const handleRate = async () => {
    // openAppStore swallows its own failures — nowhere left to go is not a
    // reason to strand someone on the last screen of onboarding.
    await openAppStore(WRITE_REVIEW_URL);
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
          {/* Names the destination: this leaves the app for the App Store,
              where "Leave a rating" implied a sheet that appears in place. */}
          <ConvoButton label="Rate on the App Store" onPress={handleRate} />
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
