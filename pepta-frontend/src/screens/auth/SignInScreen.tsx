// Onboarding screen 1b — Sign in / Sign up. Apple + Google are the only auth
// methods (mirrors Leanient): the provider returns an identity token, the
// backend creates the account if new or signs in if it exists. On success the
// AuthContext flips `isAuthenticated` and the root state machine advances.

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { Icon } from "../../components/Icon";
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from '../../config';
import { useTheme } from '../../theme';
import { AppText, Float, Mascot, Reveal } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { runAppleSignIn, shouldRenderAppleSignIn } from './appleSignIn';
import { runGoogleSignIn } from './googleSignIn';

export interface SignInScreenProps {
  onBack(): void;
}

type Provider = 'apple' | 'google';

export function SignInScreen({ onBack }: SignInScreenProps) {
  const theme = useTheme();
  const auth = useAuth();
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const showApple = shouldRenderAppleSignIn(Platform.OS);

  useEffect(() => {
    // Native Google config. The web client ID must match the backend audience.
    GoogleSignin.configure({
      iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
      webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
      scopes: ['profile', 'email'],
      offlineAccess: false,
    });
  }, []);

  const handleApple = async () => {
    if (busy) return;
    setBusy('apple');
    setError(null);
    void Haptics.selectionAsync();
    try {
      await runAppleSignIn({
        requestCredential: () =>
          AppleAuthentication.signInAsync({
            requestedScopes: [
              AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
              AppleAuthentication.AppleAuthenticationScope.EMAIL,
            ],
          }),
        signInWithApple: auth.signInWithApple,
      });
    } catch {
      // Dev bridge: the backend is deferred, so a failed sign-in drops into a
      // local session to keep the flow traversable. Remove when auth is live.
      if (__DEV__) {
        auth.devSignIn();
        return;
      }
      setError('We couldn’t sign you in with Apple. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleGoogle = async () => {
    if (busy) return;
    setBusy('google');
    setError(null);
    void Haptics.selectionAsync();
    try {
      await runGoogleSignIn({
        hasPlayServices: () => GoogleSignin.hasPlayServices(),
        signIn: () => GoogleSignin.signIn(),
        signInWithGoogle: auth.signInWithGoogle,
      });
    } catch {
      if (__DEV__) {
        auth.devSignIn();
        return;
      }
      setError('We couldn’t sign you in with Google. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <StatusBar barStyle="dark-content" />
      <LinearGradient
        colors={['#F1ECFF', theme.colors.bg] as const}
        locations={[0, 0.5] as const}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.sm }}>
          <Pressable
            onPress={onBack}
            hitSlop={theme.sizes.hitSlop}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ width: 40, height: 40, justifyContent: 'center' }}
          >
            <Icon name="chevron-back" size={26} color={theme.colors.textSecondary} />
          </Pressable>
        </View>

        <View
          style={{
            flex: 1,
            paddingHorizontal: theme.spacing['2xl'],
            paddingBottom: theme.spacing['2xl'],
          }}
        >
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.xl }}>
            <Reveal>
              <Float>
                <Mascot pose="wave" size={164} />
              </Float>
            </Reveal>
            <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
              <Reveal delay={140}>
                <AppText variant="screenTitle" align="center">
                  Welcome to Pepta
                </AppText>
              </Reveal>
              <Reveal delay={220}>
                <AppText variant="body" color="textSecondary" align="center" style={{ maxWidth: 280 }}>
                  Create your account to start tracking — lose the fat, keep the muscle.
                </AppText>
              </Reveal>
            </View>
          </View>

          <Reveal delay={320} style={{ gap: theme.spacing.md }}>
            <ProviderButton
              variant="google"
              label="Continue with Google"
              busy={busy === 'google'}
              disabled={busy != null}
              onPress={handleGoogle}
            />
            {showApple ? (
              <ProviderButton
                variant="apple"
                label="Continue with Apple"
                busy={busy === 'apple'}
                disabled={busy != null}
                onPress={handleApple}
              />
            ) : null}
          </Reveal>

          {error ? (
            <AppText
              variant="caption"
              color="danger"
              align="center"
              style={{ marginTop: theme.spacing.md }}
            >
              {error}
            </AppText>
          ) : null}

          <AppText
            variant="caption"
            color="textTertiary"
            align="center"
            style={{ marginTop: theme.spacing.lg, maxWidth: 270, alignSelf: 'center', fontSize: 11 }}
          >
            By continuing you agree to Pepta’s{' '}
            <AppText variant="caption" color="primary" style={{ fontWeight: '700', fontSize: 11 }}>
              Terms
            </AppText>{' '}
            &{' '}
            <AppText variant="caption" color="primary" style={{ fontWeight: '700', fontSize: 11 }}>
              Privacy Policy
            </AppText>
            .
          </AppText>
        </View>
      </SafeAreaView>
    </View>
  );
}

interface ProviderButtonProps {
  variant: 'apple' | 'google';
  label: string;
  busy: boolean;
  disabled: boolean;
  onPress(): void;
}

function ProviderButton({ variant, label, busy, disabled, onPress }: ProviderButtonProps) {
  const theme = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const isApple = variant === 'apple';

  const animate = (toValue: number) =>
    Animated.spring(scale, { toValue, useNativeDriver: true, ...theme.motion.springs.press }).start();

  const bg = isApple ? '#0A0A0E' : theme.colors.surface;
  const fg = isApple ? '#FFFFFF' : theme.colors.textPrimary;

  return (
    <Animated.View style={{ transform: [{ scale }], opacity: disabled && !busy ? 0.55 : 1 }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => animate(theme.motion.scale.pressIn)}
        onPressOut={() => animate(theme.motion.scale.pressOut)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          height: theme.sizes.button.height,
          borderRadius: theme.radii.pill,
          backgroundColor: bg,
          borderWidth: isApple ? 0 : 1,
          borderColor: theme.colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.sm,
        }}
      >
        {busy ? (
          <ActivityIndicator color={fg} />
        ) : (
          <>
            <Icon name={isApple ? 'logo-apple' : 'logo-google'} size={20} color={isApple ? '#FFFFFF' : '#4285F4'} />
            <AppText variant="button" style={{ color: fg }}>
              {label}
            </AppText>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}
