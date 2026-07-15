// Onboarding — Privacy (T2). The app's first promise types itself: your data
// stays yours. Terms/Privacy are quiet link rows; "Sounds good" speaks and
// auto-advances. Tracker-toned, no legalese wall.

import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { PRIVACY_URL, TERMS_URL } from '../../config';
import { ConvoScreen, convo } from '../../components';
import { typography } from '../../theme/typography';

export interface PrivacyScreenProps {
  progress: number;
  showBack?: boolean;
  onBack?(): void;
  onAccept(): void;
}

export function PrivacyScreen({ progress, showBack, onBack, onAccept }: PrivacyScreenProps) {
  return (
    <ConvoScreen<'ok'>
      progress={progress}
      onBack={showBack ? onBack : undefined}
      context="Glad you’re here."
      question="First — your data stays yours"
      questionAccent
      sub="Health data is encrypted, never sold, and you can export or delete it anytime."
      options={[{ label: 'Sounds good', value: 'ok' }]}
      onAnswer={onAccept}
    >
      <View style={{ marginTop: 26, gap: 9 }}>
        <LinkRow label="Terms of Service" onPress={() => Linking.openURL(TERMS_URL)} />
        <LinkRow label="Privacy Policy" onPress={() => Linking.openURL(PRIVACY_URL)} />
      </View>
    </ConvoScreen>
  );
}

interface LinkRowProps {
  label: string;
  onPress(): void;
}

function LinkRow({ label, onPress }: LinkRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: 10,
        paddingVertical: 13,
        paddingHorizontal: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: convo.hairline,
        backgroundColor: convo.surface,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name="document-text-outline" size={17} color={convo.soft} />
      <Text style={{ fontFamily: typography.fonts.semiBold, fontSize: 14.5, color: convo.ink, flex: 1 }}>{label}</Text>
      <Icon name="chevron-forward" size={16} color={convo.faint} />
    </Pressable>
  );
}
