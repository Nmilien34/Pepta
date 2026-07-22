// Setup / retry screen for non-final access states. Calm neutral copy —
// never an error code, never a promise of access before confirmation, and
// NEVER a paywall (only a confirmed-inactive decision may route there).
// Auto-retries at 1s, 2s, 4s, 8s, then every 15s; manual retry any time;
// support hint appears after 30 seconds.

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Mascot, ConvoButton, convo } from '../../components';
import { typography } from '../../theme/typography';

const RETRY_SCHEDULE_MS = [1_000, 2_000, 4_000, 8_000];
const RETRY_STEADY_MS = 15_000;
const SUPPORT_AFTER_MS = 30_000;

export type AccessSetupMode =
  | 'provisioning'
  | 'unavailable'
  | 'identity_verification';

const COPY: Record<AccessSetupMode, { title: string; sub: string }> = {
  provisioning: {
    title: 'Setting up your access…',
    sub: 'This usually takes a moment. Pep is on it.',
  },
  unavailable: {
    title: 'One moment…',
    sub: 'We couldn’t confirm your access just now. Retrying automatically.',
  },
  identity_verification: {
    title: 'Almost there — one check.',
    sub: 'Your invite is tied to a specific Google account. Sign in with that exact Google email to unlock your access.',
  },
};

export interface AccessSetupScreenProps {
  mode: AccessSetupMode;
  onRetry(): void;
  onSignOut(): void;
}

export function AccessSetupScreen({ mode, onRetry, onSignOut }: AccessSetupScreenProps) {
  const [showSupport, setShowSupport] = useState(false);
  const attempt = useRef(0);
  const copy = COPY[mode];
  const autoRetry = mode !== 'identity_verification';

  useEffect(() => {
    if (!autoRetry) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay =
        RETRY_SCHEDULE_MS[attempt.current] ?? RETRY_STEADY_MS;
      attempt.current += 1;
      timer = setTimeout(() => {
        onRetry();
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [autoRetry, onRetry]);

  useEffect(() => {
    const timer = setTimeout(() => setShowSupport(true), SUPPORT_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: convo.ground }}>
      <SafeAreaView style={{ flex: 1, padding: 28 }} edges={['top', 'bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
          <Mascot pose="idle" size={140} />
          {autoRetry ? <ActivityIndicator color={convo.primary} /> : null}
          <Text
            accessibilityRole="header"
            style={{
              fontFamily: typography.fonts.heavy,
              fontSize: 26,
              letterSpacing: -0.6,
              color: convo.ink,
              textAlign: 'center',
            }}
          >
            {copy.title}
          </Text>
          <Text
            style={{
              fontFamily: typography.fonts.medium,
              fontSize: 15,
              lineHeight: 22,
              color: convo.soft,
              textAlign: 'center',
              maxWidth: 300,
            }}
          >
            {copy.sub}
          </Text>
          {showSupport ? (
            <Text
              style={{
                fontFamily: typography.fonts.medium,
                fontSize: 13,
                color: convo.faint,
                textAlign: 'center',
              }}
            >
              Still stuck? Reach us at support@pepta.app — we’ll sort it out.
            </Text>
          ) : null}
        </View>

        <View style={{ gap: 4 }}>
          <ConvoButton
            label={mode === 'identity_verification' ? 'Switch account' : 'Try again'}
            onPress={mode === 'identity_verification' ? onSignOut : onRetry}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            onPress={onSignOut}
            style={({ pressed }) => ({
              alignSelf: 'center',
              paddingVertical: 12,
              paddingHorizontal: 18,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: typography.fonts.bold,
                fontSize: 14.5,
                color: convo.soft,
              }}
            >
              Sign out
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
