// Onboarding — Pace (T17). Three named paces with THEIR computed goal date in
// each sub-line; Steady comes pre-selected (recommended default). Ambitious
// warns in its own sub-line, never forbids. Sticky select → Continue.

import React, { useMemo } from 'react';
import { ConvoButton, ConvoScreen } from '../../components';
import { formatShortDate } from '../../utils/dateParts';
import { projectGoal } from '../../utils/goalProjection';

export interface GoalPaceScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  /** 0..1 slider-compatible pace value (paceToEnum maps it to the schema enum). */
  pace: number;
  onPaceChange(value: number): void;
  currentWeight: number;
  goalWeight: number;
  unit: 'lb' | 'kg';
  onContinue(): void;
}

// Representative points inside each of paceToEnum's zones.
export const PACE_VALUES = { gentle: 0.25, steady: 0.55, ambitious: 0.85 } as const;

export function GoalPaceScreen({
  progress,
  onBack,
  context,
  pace,
  onPaceChange,
  currentWeight,
  goalWeight,
  unit,
  onContinue,
}: GoalPaceScreenProps) {
  const options = useMemo(() => {
    const now = new Date();
    const describe = (p: number) => projectGoal({ currentWeight, goalWeight, pace: p, now });
    const gentle = describe(PACE_VALUES.gentle);
    const steady = describe(PACE_VALUES.steady);
    const ambitious = describe(PACE_VALUES.ambitious);
    const dateLine = (proj: ReturnType<typeof projectGoal>) =>
      proj.estimatedDate ? ` · ${goalWeight} by ${formatShortDate(proj.estimatedDate)}` : '';
    return [
      {
        label: 'Gentle',
        sub: `~${gentle.weeklyLoss} ${unit} a week${dateLine(gentle)}`,
        value: PACE_VALUES.gentle as number,
      },
      {
        label: 'Steady — recommended',
        sub: `~${steady.weeklyLoss} ${unit} a week${dateLine(steady)}`,
        value: PACE_VALUES.steady as number,
      },
      {
        label: 'Ambitious',
        sub: `~${ambitious.weeklyLoss} ${unit} a week · harder to hold muscle`,
        value: PACE_VALUES.ambitious as number,
      },
    ];
  }, [currentWeight, goalWeight, unit]);

  return (
    <ConvoScreen<number>
      progress={progress}
      onBack={onBack}
      context={context}
      question="Pick your pace."
      options={options}
      value={pace}
      onSelect={onPaceChange}
      footer={<ConvoButton label="Continue" onPress={onContinue} />}
    />
  );
}
