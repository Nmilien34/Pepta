// Onboarding — Last shot (T9). The instrument moment: this date arms the level
// model. Wheel input → Continue (precise inputs never auto-advance). For oral
// routes the copy shifts to "last dose".

import React, { useMemo } from 'react';
import { View } from 'react-native';
import { ConvoButton, ConvoScreen, DateWheel } from '../../components';
import { recentYears, type DateParts } from '../../utils/dateParts';

export interface LastShotScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  oral?: boolean;
  value: DateParts;
  onChange(parts: DateParts): void;
  onContinue(): void;
}

export function LastShotScreen({ progress, onBack, context, oral, value, onChange, onContinue }: LastShotScreenProps) {
  const years = useMemo(() => recentYears(new Date(), 5), []);
  const minYear = years[0] ?? new Date().getFullYear() - 5;
  const maxYear = years[years.length - 1] ?? new Date().getFullYear();

  return (
    <ConvoScreen
      progress={progress}
      onBack={onBack}
      context={context}
      question={oral ? 'When was your last dose?' : 'When was your last shot?'}
      sub="This date arms your level model."
      footer={<ConvoButton label="Continue" onPress={onContinue} />}
    >
      <View style={{ flex: 1, justifyContent: 'center', marginTop: 10 }}>
        <DateWheel value={value} onChange={onChange} minYear={minYear} maxYear={maxYear} maxToday />
      </View>
    </ConvoScreen>
  );
}
