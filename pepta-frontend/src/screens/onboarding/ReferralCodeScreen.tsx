// Onboarding — Referral code (between auth and the paywall). Attribution
// only: a claimed code credits a creator/campaign and NEVER changes
// subscription state, paywall eligibility, or pricing. Optional by design —
// Skip is always one tap. The backend is the authority on which codes exist;
// this screen just collects, trims, and reports friendly errors inline.

import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ConvoButton, ConvoScreen, Mascot, convo } from '../../components';
import { typography } from '../../theme/typography';
import { api } from '../../services/api';
import { ApiError } from '../../services/apiError';
import { appsFlyer } from '../../services/appsflyer';

// Matches the flow's sent-beat rhythm before moving on after a success.
const ADVANCE_MS = 900;
const ERROR_INK = '#B3413B';
const SUCCESS_INK = '#2E7D4F';

export interface ReferralCodeScreenProps {
  progress: number;
  onBack?(): void;
  /** Called for both a successful claim and a skip — continues to the paywall. */
  onDone(): void;
}

export function ReferralCodeScreen({ progress, onBack, onDone }: ReferralCodeScreenProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const finished = useRef(false);
  // Synchronous re-entry guard: `busy` state lags a frame, so a double-tap in
  // the same frame would pass a state-only check and submit twice.
  const inFlight = useRef(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void appsFlyer.logAnalyticsEvent('referral_screen_viewed');

    return () => {
      if (advanceTimer.current !== null) {
        clearTimeout(advanceTimer.current);
        advanceTimer.current = null;
      }
    };
  }, []);

  const trimmed = code.trim();

  const apply = async () => {
    if (inFlight.current || finished.current || trimmed.length === 0) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await api.claimReferralCode({ code: trimmed });
      if (finished.current) return;
      finished.current = true;
      setApplied(result.code);
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      void appsFlyer.logAnalyticsEvent('referral_code_applied');
      advanceTimer.current = setTimeout(() => {
        advanceTimer.current = null;
        onDone();
      }, ADVANCE_MS);
    } catch (err) {
      // Never log the entered code — status only.
      void appsFlyer.logAnalyticsEvent('referral_code_invalid');
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      setError(
        err instanceof ApiError
          ? err.message
          : 'Something went wrong — check your connection and try again.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const skip = () => {
    if (inFlight.current || busy || finished.current) return;
    finished.current = true;
    void appsFlyer.logAnalyticsEvent('referral_code_skipped');
    onDone();
  };

  return (
    <ConvoScreen
      progress={progress}
      onBack={onBack}
      context="You’re in."
      question="Got a referral code?"
      questionAccent
      sub="From a creator or a friend? Drop it here — you can skip this if you don’t have one."
      footer={
        <View style={{ gap: 4 }}>
          <ConvoButton
            label={busy ? 'Applying…' : applied ? 'Applied!' : 'Apply'}
            disabled={busy || applied != null || trimmed.length === 0}
            onPress={() => void apply()}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip referral code"
            disabled={busy || applied != null}
            onPress={skip}
            hitSlop={8}
            style={({ pressed }) => ({
              alignSelf: 'center',
              paddingVertical: 12,
              paddingHorizontal: 18,
              opacity: applied != null ? 0.35 : pressed ? 0.6 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: typography.fonts.bold,
                fontSize: 15,
                color: convo.soft,
              }}
            >
              Skip
            </Text>
          </Pressable>
        </View>
      }
    >
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', marginBottom: 22 }}>
          <Mascot pose={applied ? 'wave' : 'idle'} size={124} />
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: error ? ERROR_INK : convo.hairline,
            backgroundColor: convo.surface,
            borderRadius: 18,
            paddingHorizontal: 16,
            paddingVertical: 4,
          }}
        >
          <TextInput
            accessibilityLabel="Referral code"
            value={code}
            onChangeText={(next) => {
              setCode(next);
              if (error) setError(null);
            }}
            placeholder="Enter code"
            placeholderTextColor={convo.faint}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            maxLength={32}
            returnKeyType="go"
            onSubmitEditing={() => void apply()}
            editable={!busy && applied == null}
            style={{
              fontFamily: typography.fonts.semiBold,
              fontSize: 17,
              letterSpacing: 1,
              color: convo.ink,
              paddingVertical: 12,
            }}
          />
        </View>

        {error ? (
          <Text
            accessibilityRole="alert"
            style={{
              fontFamily: typography.fonts.medium,
              fontSize: 13.5,
              lineHeight: 19,
              color: ERROR_INK,
              marginTop: 10,
            }}
          >
            {error}
          </Text>
        ) : null}

        {applied ? (
          <Text
            style={{
              fontFamily: typography.fonts.semiBold,
              fontSize: 13.5,
              color: SUCCESS_INK,
              marginTop: 10,
            }}
          >
            {`${applied} applied — you’re set.`}
          </Text>
        ) : null}
      </View>
    </ConvoScreen>
  );
}
