// Onboarding — injection device. Asked after the dose for injection routes:
// what the user actually injects with shapes dose-logging UX (pens click in
// fixed doses; vial users draw each dose) and future supply tracking. Stored
// on the compound as `deviceType` (optional in the shared schema).

import React from 'react';
import { View } from 'react-native';
import type { InjectionDeviceType } from '@pepta/shared';
import { Icon } from '../../components/Icon';
import { useTheme } from '../../theme';
import { AppText, Button, OnboardingScaffold, OptionCard } from '../../components';

export interface DeviceTypeScreenProps {
  progress: number;
  onBack?(): void;
  medicationName?: string;
  value?: InjectionDeviceType;
  onChange(value: InjectionDeviceType): void;
  onContinue(): void;
}

export function DeviceTypeScreen({
  progress,
  onBack,
  medicationName,
  value,
  onChange,
  onContinue,
}: DeviceTypeScreenProps) {
  const theme = useTheme();

  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      footer={<Button label="Continue" onPress={onContinue} disabled={!value} />}
    >
      <AppText variant="obTitle">What do you inject with?</AppText>
      <AppText variant="caption" color="textSecondary" style={{ marginTop: theme.spacing.sm }}>
        {medicationName ? `How your ${medicationName} doses come.` : 'This tunes dose logging for your setup.'}
      </AppText>

      <View style={{ gap: 11, marginTop: theme.spacing.xl }}>
        <OptionCard
          title="Single-dose pen"
          subtitle="One prefilled pen per shot"
          icon={<Icon name="needle" size={22} color={theme.colors.primary} />}
          selected={value === 'single_dose_pen'}
          onPress={() => onChange('single_dose_pen')}
        />
        <OptionCard
          title="Auto-injector"
          subtitle="Reusable or dial-a-dose pen"
          icon={<Icon name="adjustments-horizontal" size={22} color={theme.colors.fiber} />}
          selected={value === 'auto_injector'}
          onPress={() => onChange('auto_injector')}
        />
        <OptionCard
          title="Syringe & vial"
          subtitle="You draw each dose yourself"
          icon={<Icon name="flask" size={22} color={theme.colors.water} />}
          selected={value === 'syringe_vial'}
          onPress={() => onChange('syringe_vial')}
        />
        <OptionCard
          title="Other or not sure"
          subtitle="You can change this later in Settings"
          icon={<Icon name="help-circle" size={22} color={theme.colors.warning} />}
          selected={value === 'other'}
          onPress={() => onChange('other')}
        />
      </View>
    </OnboardingScaffold>
  );
}
