// Onboarding screen 15 — Goal pace. An expressive slider (walk → car → rocket)
// with a live estimated-goal-date chip and a reassuring, tracker-toned line. The
// projection is a frontend preview (projectGoal); the real date arrives from the
// backend later. profile.goalPace isn't in the current schema → navigator-local.

import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Icon } from "../../components/Icon";
import { useTheme } from '../../theme';
import { AppText, Button, OnboardingScaffold, Slider } from '../../components';
import { formatShortDate } from '../../utils/dateParts';
import { projectGoal } from '../../utils/goalProjection';

export interface GoalPaceScreenProps {
  progress: number;
  onBack?(): void;
  pace: number;
  onPaceChange(value: number): void;
  currentWeight: number;
  goalWeight: number;
  unit: 'lb' | 'kg';
  onContinue(): void;
}

const ICONS: ('walk' | 'car' | 'rocket-launch')[] = ['walk', 'car', 'rocket-launch'];

export function GoalPaceScreen({
  progress,
  onBack,
  pace,
  onPaceChange,
  currentWeight,
  goalWeight,
  unit,
  onContinue,
}: GoalPaceScreenProps) {
  const theme = useTheme();
  const projection = useMemo(
    () => projectGoal({ currentWeight, goalWeight, pace, now: new Date() }),
    [currentWeight, goalWeight, pace],
  );

  const zoneIndex = Math.min(2, Math.floor(pace * 3));
  const descriptor =
    pace < 0.4
      ? 'gentle and sustainable, and easier on your muscle.'
      : pace < 0.72
        ? 'steady and sustainable — a good balance.'
        : 'ambitious — keep protein high to protect your muscle.';

  const hasGoal = projection.estimatedDate !== null;
  const chipLabel = hasGoal
    ? `Estimated goal · ${formatShortDate(projection.estimatedDate!)}`
    : 'Holding steady';
  const line = hasGoal
    ? `~${projection.weeklyLoss} ${unit} / week — ${descriptor}`
    : 'Holding steady — we’ll keep your muscle and energy up.';

  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      footer={<Button label="Continue" onPress={onContinue} />}
    >
      <AppText variant="obTitle">How fast feels right?</AppText>

      <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing['2xl'] }}>
        <View style={{ alignItems: 'center' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: '#EFEBFF',
              paddingVertical: 7,
              paddingHorizontal: 13,
              borderRadius: theme.radii.pill,
            }}
          >
            <Icon name="flag-outline" size={14} color="#5B45C9" />
            <AppText variant="caption" style={{ color: '#5B45C9', fontWeight: '700' }}>
              {chipLabel}
            </AppText>
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {ICONS.map((icon, i) => (
            <Icon
              key={icon}
              name={icon}
              size={24}
              color={i === zoneIndex ? theme.colors.primary : theme.colors.textSecondary}
            />
          ))}
        </View>

        <Slider value={pace} onChange={onPaceChange} />

        <View style={{ padding: 14, borderRadius: 16, backgroundColor: theme.colors.surfaceAlt }}>
          <AppText variant="caption" color="textPrimary" align="center">
            {line}
          </AppText>
        </View>
      </View>
    </OnboardingScaffold>
  );
}
