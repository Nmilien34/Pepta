// Onboarding — Meet Pep (T2b). The funnel's speaker steps forward: right after
// the privacy promise, Pep introduces himself so every dim echo from here on
// reads as Pep talking. The footer CTA is the funnel's first real interaction —
// "Wave back" flips the pose to the wave, lands the second bubble with the
// success thump, and auto-advances on the sent-beat rhythm.

import React, { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  ConvoButton,
  ConvoScreen,
  Mascot,
  OnboardingMotionContext,
  convo,
} from '../../components';
import { typography } from '../../theme/typography';

// Matches ConvoScreen's ACKNOWLEDGE_MS so the wave holds exactly one beat.
const ADVANCE_MS = 950;

export interface MeetPepScreenProps {
  progress: number;
  onBack?(): void;
  onContinue(): void;
}

export function MeetPepScreen({ progress, onBack, onContinue }: MeetPepScreenProps) {
  const { animate } = useContext(OnboardingMotionContext);
  const [waved, setWaved] = useState(false);
  const bob = useRef(new Animated.Value(0)).current;
  const greetPop = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const replyPop = useRef(new Animated.Value(0)).current;
  const waveSwap = useRef(new Animated.Value(0)).current;
  const advanced = useRef(false);

  // Ambient idle bob — runs regardless of entrance animation.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);

  const greet = () => {
    Animated.spring(greetPop, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
  };

  const wave = () => {
    if (advanced.current) return;
    advanced.current = true;
    // ConvoButton already gave the warm tap; land the success thump as the
    // wave arrives (the sent-message haptic grammar).
    if (Platform.OS !== 'web') {
      setTimeout(() => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 220);
    }
    setWaved(true);
    Animated.timing(waveSwap, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    Animated.spring(replyPop, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
    setTimeout(onContinue, ADVANCE_MS);
  };

  const bobY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });

  return (
    <ConvoScreen
      progress={progress}
      onBack={onBack}
      context="That’s settled."
      question="Now — meet Pep"
      questionAccent
      sub="Your guide in here. Pep turns your answers into your plan — and explains any number you ever wonder about."
      onTyped={greet}
      footer={<ConvoButton label={waved ? 'Pep waves back!' : 'Wave back 👋'} onPress={wave} />}
    >
      <View style={{ flex: 1, justifyContent: 'center', paddingTop: 18 }}>
        <Animated.View
          style={{
            alignSelf: 'flex-start',
            opacity: greetPop,
            transform: [
              { translateY: greetPop.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
              { scale: greetPop.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
            ],
          }}
        >
          <Bubble text="Hi — I’m Pep! 👋" />
        </Animated.View>

        <View style={{ height: 200, alignItems: 'center', justifyContent: 'flex-end', marginTop: 10 }}>
          <Animated.View
            style={{
              position: 'absolute',
              opacity: waveSwap.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
              transform: [{ translateY: bobY }],
            }}
          >
            <Mascot pose="idle" size={176} />
          </Animated.View>
          <Animated.View
            style={{
              position: 'absolute',
              opacity: waveSwap,
              transform: [
                { translateY: bobY },
                { scale: waveSwap.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
              ],
            }}
          >
            {waved ? <Mascot pose="wave" size={186} /> : null}
          </Animated.View>
        </View>

        <Animated.View
          style={{
            alignSelf: 'flex-end',
            marginTop: 12,
            opacity: replyPop,
            transform: [
              { translateY: replyPop.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
              { scale: replyPop.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
            ],
          }}
        >
          <Bubble text="Ask me anything, anytime." tail="right" />
        </Animated.View>
      </View>
    </ConvoScreen>
  );
}

// Pep's speech bubble — the received-message idiom (white, hairline, soft tail).
function Bubble({ text, tail = 'left' }: { text: string; tail?: 'left' | 'right' }) {
  return (
    <View
      style={{
        backgroundColor: convo.surface,
        borderWidth: 1,
        borderColor: convo.hairline,
        borderRadius: 20,
        borderBottomLeftRadius: tail === 'left' ? 7 : 20,
        borderBottomRightRadius: tail === 'right' ? 7 : 20,
        paddingVertical: 12,
        paddingHorizontal: 16,
        shadowColor: convo.ink,
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 18,
        shadowOpacity: 0.08,
        elevation: 3,
      }}
    >
      <Text style={{ fontFamily: typography.fonts.semiBold, fontSize: 15, color: convo.ink }}>{text}</Text>
    </View>
  );
}
