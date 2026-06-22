// Onboarding screen 2 — Privacy & legal. Reassuring (not legalese-heavy): a calm
// title, a supportive line, two tappable link rows (Terms, Privacy), and an
// "Accept & continue" CTA. Tracker-toned, no judgment.

import React from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PRIVACY_URL, TERMS_URL } from '../../config';
import { useTheme } from '../../theme';
import { AppText, Button, Mascot, OnboardingScaffold } from '../../components';

export interface PrivacyScreenProps {
  progress: number;
  showBack?: boolean;
  onBack?(): void;
  onAccept(): void;
}

export function PrivacyScreen({ progress, showBack, onBack, onAccept }: PrivacyScreenProps) {
  const theme = useTheme();

  return (
    <OnboardingScaffold
      progress={progress}
      showBack={showBack}
      onBack={onBack}
      footer={<Button label="Accept & continue" onPress={onAccept} />}
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.lg }}>
        <Mascot pose="idle" size={96} />
        <AppText variant="obTitle" align="center">
          Your privacy{'\n'}comes first.
        </AppText>
        <AppText variant="body" color="textSecondary" align="center" style={{ maxWidth: 300 }}>
          Your health data is encrypted and never sold. You’re always in control.
        </AppText>
        <View style={{ width: '100%', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
          <LinkRow
            icon={<Ionicons name="document-text-outline" size={18} color={theme.colors.textSecondary} />}
            label="Terms of Service"
            onPress={() => Linking.openURL(TERMS_URL)}
          />
          <LinkRow
            icon={<Ionicons name="lock-closed-outline" size={18} color={theme.colors.primary} />}
            label="Privacy Policy"
            onPress={() => Linking.openURL(PRIVACY_URL)}
          />
        </View>
      </View>
    </OnboardingScaffold>
  );
}

interface LinkRowProps {
  icon: React.ReactNode;
  label: string;
  onPress(): void;
}

function LinkRow({ icon, label, onPress }: LinkRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: 15,
        borderRadius: 16,
        backgroundColor: theme.colors.surfaceAlt,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          backgroundColor: theme.colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>
      <AppText variant="bodyStrong" style={{ flex: 1, fontWeight: '700' }}>
        {label}
      </AppText>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
    </Pressable>
  );
}
