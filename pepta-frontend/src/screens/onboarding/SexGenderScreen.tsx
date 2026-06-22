// Onboarding screen 10 — Sex & gender. Four warm, inclusive options. The current
// @pepta/shared schema only has profile.sex (male|female, used for the calorie
// estimate) and no genderIdentity field, so the 4-way choice lives in navigator
// state. Woman→female / Man→male map cleanly; non-binary / prefer-not need a
// separate sex-at-birth question or a backend default before the calorie math.
// TODO: persist genderIdentity + resolve sex once the schema/backend support it.

import React from 'react';
import { View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import { AppText, Button, OnboardingScaffold, SelectTile } from '../../components';

export type GenderIdentity = 'woman' | 'man' | 'nonbinary' | 'prefer_not_to_say';

export interface SexGenderScreenProps {
  progress: number;
  onBack?(): void;
  value?: GenderIdentity;
  onChange(value: GenderIdentity): void;
  onContinue(): void;
}

interface GenderOption {
  value: GenderIdentity;
  label: string;
  icon: 'gender-female' | 'gender-male' | 'gender-non-binary' | 'dots-horizontal';
  color: string;
}

const OPTIONS: GenderOption[] = [
  { value: 'woman', label: 'Woman', icon: 'gender-female', color: '#E25CC4' },
  { value: 'man', label: 'Man', icon: 'gender-male', color: '#2FA8FF' },
  { value: 'nonbinary', label: 'Non-binary', icon: 'gender-non-binary', color: '#7C5CFC' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say', icon: 'dots-horizontal', color: '#6B6B76' },
];

export function SexGenderScreen({ progress, onBack, value, onChange, onContinue }: SexGenderScreenProps) {
  const theme = useTheme();

  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      footer={<Button label="Continue" onPress={onContinue} disabled={value === undefined} />}
    >
      <AppText variant="obTitle">How do you identify?</AppText>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: theme.spacing.lg }}>
        {OPTIONS.map((option) => (
          <View key={option.value} style={{ flexBasis: '47%', flexGrow: 1 }}>
            <SelectTile
              label={option.label}
              align="center"
              selected={value === option.value}
              onPress={() => onChange(option.value)}
              icon={<MaterialCommunityIcons name={option.icon} size={24} color={option.color} />}
            />
          </View>
        ))}
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          marginTop: theme.spacing.lg,
          padding: 14,
          borderRadius: 16,
          backgroundColor: theme.colors.surfaceAlt,
        }}
      >
        <Ionicons name="information-circle-outline" size={18} color={theme.colors.textSecondary} />
        <AppText variant="caption" color="textSecondary" style={{ flex: 1 }}>
          Sex is only used to estimate your calorie needs.
        </AppText>
      </View>
    </OnboardingScaffold>
  );
}
