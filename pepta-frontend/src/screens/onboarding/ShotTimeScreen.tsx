// Onboarding — Shot time (T10b). The first reminder lands at THEIR hour instead
// of a default, so the setup feels dialed-in on day one. Presets speak and
// auto-advance; "Pick exact time" holds the turn open with an hour wheel.

import React from 'react';
import { View } from 'react-native';
import { ConvoButton, ConvoScreen, WheelPicker, type WheelItem } from '../../components';

type ShotTimeChoice = 'morning' | 'midday' | 'evening' | 'exact';

export const SHOT_TIME_HOURS: Record<Exclude<ShotTimeChoice, 'exact'>, number> = {
  morning: 8,
  midday: 12,
  evening: 20,
};

export interface ShotTimeScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  /** 0–23; the answer the navigator stores. */
  exactHour: number;
  onExactHourChange(hour: number): void;
  onAnswer(hour: number): void;
}

function hourLabel(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
}

const HOUR_ITEMS: WheelItem[] = Array.from({ length: 24 }, (_, hour) => ({
  label: hourLabel(hour),
  value: hour,
}));

export function ShotTimeScreen({
  progress,
  onBack,
  context,
  exactHour,
  onExactHourChange,
  onAnswer,
}: ShotTimeScreenProps) {
  const [holding, setHolding] = React.useState(false);

  return (
    <ConvoScreen<ShotTimeChoice>
      progress={progress}
      onBack={onBack}
      context={context}
      question="What time, usually?"
      sub="Your reminders land at this hour."
      options={[
        { label: 'Morning', sub: 'around 8 AM', value: 'morning' },
        { label: 'Midday', value: 'midday' },
        { label: 'Evening', sub: 'around 8 PM', value: 'evening' },
        { label: 'Pick exact time', value: 'exact', holds: true },
      ]}
      value={holding ? 'exact' : undefined}
      onSelect={() => setHolding(true)}
      onAnswer={(choice) => {
        if (choice !== 'exact') onAnswer(SHOT_TIME_HOURS[choice]);
      }}
      footer={holding ? <ConvoButton label="Continue" onPress={() => onAnswer(exactHour)} /> : undefined}
    >
      {holding ? (
        <View style={{ marginTop: 22 }}>
          <WheelPicker items={HOUR_ITEMS} value={exactHour} onChange={onExactHourChange} />
        </View>
      ) : null}
    </ConvoScreen>
  );
}
