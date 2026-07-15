// Onboarding — Shot day (T10). Derived, not re-asked: the last-shot date names
// the day ("Sundays are shot day?") and the user confirms in one tap. "Pick
// another day" holds the turn open with the day-of-week picker + Continue.

import React from 'react';
import { View } from 'react-native';
import { ConvoButton, ConvoScreen, DayOfWeekPicker } from '../../components';

type ShotDayChoice = 'confirm' | 'other';

const DAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

export interface ShotDayScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  /** 0–6 weekday derived from the last-shot date. */
  derivedDay: number;
  value: number[];
  onToggle(day: number): void;
  /** Called with the confirmed day list; the navigator stores + advances. */
  onAnswer(days: number[]): void;
}

export function ShotDayScreen({ progress, onBack, context, derivedDay, value, onToggle, onAnswer }: ShotDayScreenProps) {
  const [holding, setHolding] = React.useState(false);
  const dayName = DAY_NAMES[derivedDay] ?? 'Sundays';

  return (
    <ConvoScreen<ShotDayChoice>
      progress={progress}
      onBack={onBack}
      context={context}
      question={`${dayName} are shot day?`}
      options={[
        { label: `${dayName} it is`, value: 'confirm' },
        { label: 'Pick another day', value: 'other', holds: true },
      ]}
      value={holding ? 'other' : undefined}
      onSelect={() => setHolding(true)}
      onAnswer={(choice) => {
        if (choice === 'confirm') onAnswer([derivedDay]);
      }}
      footer={
        holding ? (
          <ConvoButton label="Continue" disabled={value.length === 0} onPress={() => onAnswer(value)} />
        ) : undefined
      }
    >
      {holding ? (
        <View style={{ marginTop: 24 }}>
          <DayOfWeekPicker value={value} onToggle={onToggle} />
        </View>
      ) : null}
    </ConvoScreen>
  );
}
