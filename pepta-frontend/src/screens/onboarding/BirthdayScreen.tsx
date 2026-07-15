// Onboarding — Birthday (T13). A month/day/year wheel inside the conversation
// turn (wheel = Continue). Year range capped at 13+, so no future-date clamp
// is needed. Each scroll fires the wheel's own haptic tick.

import React, { useMemo } from 'react';
import { View } from 'react-native';
import { ConvoButton, ConvoScreen, DateWheel } from '../../components';
import type { DateParts } from '../../utils/dateParts';

export interface BirthdayScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  value: DateParts;
  onChange(parts: DateParts): void;
  onContinue(): void;
}

export function BirthdayScreen({ progress, onBack, context, value, onChange, onContinue }: BirthdayScreenProps) {
  const { minYear, maxYear } = useMemo(() => {
    const current = new Date().getFullYear();
    return { minYear: current - 100, maxYear: current - 13 };
  }, []);

  return (
    <ConvoScreen
      progress={progress}
      onBack={onBack}
      context={context}
      question="When were you born?"
      sub="Age tunes your calorie and protein targets."
      footer={<ConvoButton label="Continue" onPress={onContinue} />}
    >
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <DateWheel value={value} onChange={onChange} minYear={minYear} maxYear={maxYear} />
      </View>
    </ConvoScreen>
  );
}
