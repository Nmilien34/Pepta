// Onboarding — Beat C · The fear, answered. Their worry sits on screen as their
// own sent words; the answer types back underneath: stat + citation + "built
// next" in one breath. Stats only where we have real sources (muscle/lean-mass
// worries cite the STEP-1 / SURMOUNT-1 body-composition analyses; other worries
// get honest reassurance with no invented numbers). Bespoke layout — the sent
// bubble must appear BEFORE the question types, so this composes Typewriter
// directly rather than using ConvoScreen's chip flow.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BiggestWorry } from '@pepta/shared';
import { CitedStat, ConvoButton, Icon, Typewriter, convo } from '../../components';
import { typography } from '../../theme/typography';

interface FearCopy {
  /** Their chip label, replayed as the sent bubble. */
  spoken: string;
  statNum?: string;
  line: string;
  cite?: string;
}

const FEAR_COPY: Record<BiggestWorry, FearCopy> = {
  losing_muscle: {
    spoken: 'Losing muscle',
    statNum: '25–39%',
    line: 'of weight lost on GLP-1s can be lean mass when it goes unmanaged. It’s preventable — your muscle guard is built next.',
    cite: 'STEP-1 & SURMOUNT-1 body-composition analyses',
  },
  ozempic_face: {
    spoken: '“Ozempic face”',
    statNum: '25–39%',
    line: 'of rapid weight loss can be lean mass — volume loss shows first in the face. Pace + protein are the guards, and yours are built next.',
    cite: 'STEP-1 & SURMOUNT-1 body-composition analyses',
  },
  side_effects: {
    spoken: 'Side effects',
    line: 'Most GI effects cluster around dose changes and ease with time. Your log ties symptoms to doses, so you and your doctor see the pattern — that watch starts now.',
  },
  stalling: {
    spoken: 'Stalling out',
    line: 'Plateaus are part of every real weight curve. The trend view separates a true stall from noise weeks earlier than the scale — it’s built next.',
  },
  rebound: {
    spoken: 'Regaining it',
    line: 'Drift shows in the data before it shows in the mirror. Your trend line and weekly logging catch it early — that’s exactly what gets built next.',
  },
  energy: {
    spoken: 'Low energy',
    line: 'Protein, hydration and shot-day timing are the energy levers — all three are tracked here, and your targets are built next.',
  },
};

export interface FearAnsweredScreenProps {
  progress: number;
  onBack?(): void;
  worry?: BiggestWorry;
  onContinue(): void;
}

export function FearAnsweredScreen({ progress, onBack, worry, onContinue }: FearAnsweredScreenProps) {
  const copy = FEAR_COPY[worry ?? 'losing_muscle'];
  const [sentIn, setSentIn] = useState(false);
  const [typed, setTyped] = useState(false);
  const sentPop = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!sentIn) return;
    Animated.spring(sentPop, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
  }, [sentIn, sentPop]);

  useEffect(() => {
    if (!typed) return;
    Animated.timing(reveal, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [typed, reveal]);

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
            text="What worries you most?"
            speed={14}
            delay={120}
            caret={false}
            haptic={false}
            style={styles.context}
            onDone={() => setSentIn(true)}
          />

          <Animated.View
            style={[
              styles.sent,
              {
                opacity: sentPop,
                transform: [
                  { translateY: sentPop.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
                  { scale: sentPop.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
                ],
              },
            ]}
          >
            <Text style={styles.sentText}>{copy.spoken}</Text>
          </Animated.View>

          <View style={{ marginTop: 30 }}>
            <Text style={styles.question}>
              <Typewriter
                text="You’re right to watch it"
                start={sentIn}
                delay={420}
                style={styles.question}
                onDone={() => setTyped(true)}
              />
              {typed ? <Text style={styles.accent}>{' ■'}</Text> : null}
            </Text>
          </View>

          <Animated.View style={{ opacity: reveal, paddingTop: 34 }}>
            <CitedStat value={copy.statNum} line={copy.line} cite={copy.cite} />
          </Animated.View>
        </ScrollView>

        <Animated.View style={[styles.footer, { opacity: reveal }]}>
          <ConvoButton label="Build my targets" onPress={onContinue} />
        </Animated.View>
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
  sent: {
    alignSelf: 'flex-end',
    marginTop: 22,
    backgroundColor: convo.primary,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 22,
    borderBottomRightRadius: 7,
    shadowColor: convo.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    shadowOpacity: 0.25,
    elevation: 4,
  },
  sentText: { fontFamily: typography.fonts.bold, fontSize: 16, color: convo.onPrimary },
  question: {
    fontFamily: typography.fonts.heavy,
    fontSize: 30,
    lineHeight: 37,
    letterSpacing: -0.8,
    color: convo.ink,
  },
  accent: { color: convo.primary, fontSize: 22 },
  footer: { paddingHorizontal: 22, paddingBottom: 12 },
});
