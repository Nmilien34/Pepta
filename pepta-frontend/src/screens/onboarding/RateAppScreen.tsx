// Onboarding — rating ask, right after the plan reveal (the emotional peak,
// before sign-up/paywall friction — the competitor pattern). The NATIVE Apple
// star card auto-presents shortly after the screen settles; once they've
// tapped stars, the "Want to say more?" link opens the App Store review
// composer for written words. Apple throttles the native card (it may not
// show on re-installs) and gives no callback, so the screen never gates on
// it: Continue is always live, prompting is once-per-install, and the flow
// works identically when the card is suppressed.

import React, { useEffect, useRef } from 'react';
import { Linking, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { ConvoButton, Icon, Typewriter, convo } from '../../components';
import { typography } from '../../theme/typography';
import { APPSFLYER_APP_ID } from '../../config';

const PROMPTED_KEY = 'pepta:rate-app-prompted';
const PROMPT_DELAY_MS = 700;

// The store id doubles as the review-composer deep link target.
function writeReviewUrl(): string | null {
  if (!APPSFLYER_APP_ID) return null;
  return `https://apps.apple.com/app/id${APPSFLYER_APP_ID}?action=write-review`;
}

async function presentNativeRatingCardOnce(): Promise<void> {
  try {
    const already = await AsyncStorage.getItem(PROMPTED_KEY);
    if (already) return;
    await AsyncStorage.setItem(PROMPTED_KEY, new Date().toISOString());
    if (await StoreReview.isAvailableAsync()) {
      await StoreReview.requestReview();
    }
  } catch (error) {
    console.warn('[RateApp] Could not present the rating card.', error);
  }
}

export interface RateAppScreenProps {
  progress: number;
  onBack?(): void;
  onContinue(): void;
}

export function RateAppScreen({ progress, onBack, onContinue }: RateAppScreenProps) {
  const promptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    promptTimer.current = setTimeout(() => {
      void presentNativeRatingCardOnce();
    }, PROMPT_DELAY_MS);
    return () => {
      if (promptTimer.current) clearTimeout(promptTimer.current);
    };
  }, []);

  const reviewUrl = writeReviewUrl();

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          {onBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} onPress={onBack}>
              <Icon name="chevron-back" size={22} color={convo.ink} />
            </Pressable>
          ) : (
            <View style={{ width: 22 }} />
          )}
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Typewriter
            text="Your plan is set."
            speed={14}
            delay={120}
            caret={false}
            haptic={false}
            style={styles.context}
          />

          <Text style={styles.title}>
            A quick favor?<Text style={styles.accent}>{' ■'}</Text>
          </Text>

          <View style={styles.stars} accessibilityLabel="Five stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <Icon key={n} name="star" size={30} color={convo.primary} />
            ))}
          </View>

          <Text style={styles.line}>
            Ratings help other GLP-1 users find a tracker that takes their
            health — and their data — seriously.
          </Text>
        </ScrollView>

        <View style={styles.footer}>
          <ConvoButton label="Continue" variant="solid" onPress={onContinue} />
          {reviewUrl ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Write a review"
              hitSlop={8}
              onPress={() => Linking.openURL(reviewUrl).catch(() => undefined)}
              style={styles.reviewLink}
            >
              <Text style={styles.reviewLinkText}>Want to say more? Write a review</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: convo.ground },
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 8 },
  track: { flex: 1, height: 3, borderRadius: 1.5, backgroundColor: convo.hairline },
  fill: { height: 3, borderRadius: 1.5, backgroundColor: convo.primary },
  body: { paddingHorizontal: 28, paddingTop: 36, paddingBottom: 30, flexGrow: 1 },
  context: {
    fontFamily: typography.fonts.bold,
    fontSize: 29,
    lineHeight: 36,
    letterSpacing: -0.75,
    color: convo.dim,
  },
  title: {
    marginTop: 12,
    fontFamily: typography.fonts.heavy,
    fontSize: 30,
    lineHeight: 37,
    letterSpacing: -0.8,
    color: convo.ink,
  },
  accent: { color: convo.primary, fontSize: 22 },
  stars: { flexDirection: 'row', gap: 8, marginTop: 34 },
  line: {
    marginTop: 22,
    fontFamily: typography.fonts.medium,
    fontSize: 16,
    lineHeight: 24,
    color: convo.dim,
  },
  footer: { paddingHorizontal: 22, paddingBottom: 12 },
  reviewLink: { alignSelf: 'center', marginTop: 14, paddingVertical: 4 },
  reviewLinkText: {
    fontFamily: typography.fonts.bold,
    fontSize: 13,
    color: convo.primary,
  },
});
