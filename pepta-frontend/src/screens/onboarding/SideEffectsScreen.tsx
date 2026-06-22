// Onboarding screen 19 — Side-effect baseline → sideEffectBaseline[] (real schema
// field; types use the @pepta/shared enum). Multi-select chips with an exclusive
// "None" (= empty array). Continue is always allowed (no effects is valid).
//
// NOTE: the lab mocked extra options (hair loss, bloating, sulfur burps) that are
// NOT in the shared SIDE_EFFECT_TYPES enum, so they're omitted here rather than
// invented. Flag for Nick if the backend should add them.

import React from 'react';
import { View } from 'react-native';
import type { OnboardingCompleteInput } from '@pepta/shared';
import { useTheme } from '../../theme';
import { AppText, Button, Chip, OnboardingScaffold } from '../../components';

export type SideEffectType = OnboardingCompleteInput['sideEffectBaseline'][number];

export interface SideEffectsScreenProps {
  progress: number;
  onBack?(): void;
  value: SideEffectType[];
  onToggle(effect: SideEffectType): void;
  onClear(): void;
  onContinue(): void;
}

const EFFECTS: { value: SideEffectType; label: string }[] = [
  { value: 'nausea', label: 'Nausea' },
  { value: 'constipation', label: 'Constipation' },
  { value: 'diarrhea', label: 'Diarrhea' },
  { value: 'fatigue', label: 'Fatigue' },
  { value: 'headache', label: 'Headache' },
  { value: 'reflux', label: 'Reflux' },
  { value: 'appetite_suppression', label: 'Appetite loss' },
  { value: 'injection_site_reaction', label: 'Injection-site reaction' },
  { value: 'other', label: 'Other' },
];

export function SideEffectsScreen({ progress, onBack, value, onToggle, onClear, onContinue }: SideEffectsScreenProps) {
  const theme = useTheme();
  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      footer={<Button label="Continue" onPress={onContinue} />}
    >
      <AppText variant="obTitle">Any side effects so far?</AppText>
      <AppText variant="caption" color="textSecondary" style={{ marginTop: theme.spacing.sm }}>
        So we can help you manage them.
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: theme.spacing.lg }}>
        <Chip label="None" selected={value.length === 0} onPress={onClear} multi />
        {EFFECTS.map((effect) => (
          <Chip
            key={effect.value}
            label={effect.label}
            selected={value.includes(effect.value)}
            onPress={() => onToggle(effect.value)}
            multi
          />
        ))}
      </View>
    </OnboardingScaffold>
  );
}
