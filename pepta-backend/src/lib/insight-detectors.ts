export type DetectorSeverity = 'info' | 'positive' | 'warning' | 'critical';

interface DetectorSignalBase {
  type:
    | 'dose_cycle'
    | 'medication_level'
    | 'protein_retention'
    | 'side_effect_pattern'
    | 'stall';
  active: boolean;
  severity: DetectorSeverity;
  message: string;
}

export interface MedicationLevelSignal extends DetectorSignalBase {
  type: 'medication_level';
  ratioToPeak: number;
}

export interface DoseCycleSignal extends DetectorSignalBase {
  type: 'dose_cycle';
  daysSinceLastDose: number;
  scheduleIntervalDays: number;
}

export interface ProteinRetentionSignal extends DetectorSignalBase {
  type: 'protein_retention';
  proteinAdherence: number;
  trainingAdherence: number;
}

export interface ProteinTrendSignal extends DetectorSignalBase {
  type: 'protein_retention';
  proteinAdherence: number;
  trainingAdherence: number;
  trend: 'declining' | 'stable' | 'improving';
}

export interface StallSignal extends DetectorSignalBase {
  type: 'stall';
  daysWeightFlat: number;
}

export interface SideEffectCycleSignal extends DetectorSignalBase {
  type: 'side_effect_pattern';
  correlatedCycleDay: number | null;
  averageSeverity: number;
}

export function detectMedicationLevelState(input: {
  currentEstimate: number;
  peakEstimate: number;
}): MedicationLevelSignal {
  const ratioToPeak = input.peakEstimate > 0 ? input.currentEstimate / input.peakEstimate : 0;
  const active = ratioToPeak < 0.4;

  return {
    type: 'medication_level',
    active,
    severity: active ? 'warning' : 'info',
    ratioToPeak: Number(ratioToPeak.toFixed(3)),
    message: active ? 'Medication estimate is in the lower part of the dose curve.' : 'Medication estimate is steady.',
  };
}

export function detectDoseCycleTrough(input: {
  daysSinceLastDose: number;
  scheduleIntervalDays: number;
}): DoseCycleSignal {
  const troughStart = Math.max(1, input.scheduleIntervalDays - 2);
  const active = input.daysSinceLastDose >= troughStart;

  return {
    type: 'dose_cycle',
    active,
    severity: active ? 'info' : 'positive',
    daysSinceLastDose: input.daysSinceLastDose,
    scheduleIntervalDays: input.scheduleIntervalDays,
    message: active ? 'User is near the lower-appetite-support window of the cycle.' : 'User is early or mid-cycle.',
  };
}

export function detectProteinRetentionRisk(input: {
  averageProteinGrams: number;
  proteinTargetGrams: number;
  resistanceSessions: number;
  resistanceSessionTarget: number;
}): ProteinRetentionSignal {
  const proteinAdherence =
    input.proteinTargetGrams > 0 ? input.averageProteinGrams / input.proteinTargetGrams : 0;
  const trainingAdherence =
    input.resistanceSessionTarget > 0
      ? input.resistanceSessions / input.resistanceSessionTarget
      : 0;
  const active = proteinAdherence < 0.8 || trainingAdherence < 0.67;

  return {
    type: 'protein_retention',
    active,
    severity: active ? 'warning' : 'positive',
    proteinAdherence: Number(proteinAdherence.toFixed(3)),
    trainingAdherence: Number(trainingAdherence.toFixed(3)),
    message: active ? 'Protein or training is below the retention target.' : 'Protein and training are aligned with retention goals.',
  };
}

export function detectProteinTrend(weeks: Array<{ adherence: number }>): ProteinTrendSignal {
  if (weeks.length < 3) {
    return {
      type: 'protein_retention',
      active: false,
      severity: 'info',
      proteinAdherence: weeks.at(-1)?.adherence ?? 0,
      trainingAdherence: 0,
      trend: 'stable',
      message: 'Not enough weekly protein data to detect a trend.',
    };
  }

  const recent = weeks.slice(-3);
  const first = recent[0]!.adherence;
  const second = recent[1]!.adherence;
  const third = recent[2]!.adherence;
  const declining = first > second && second > third;
  const improving = first < second && second < third;
  const trend = declining ? 'declining' : improving ? 'improving' : 'stable';
  const active = declining && first - third >= 0.1;

  return {
    type: 'protein_retention',
    active,
    severity: active ? 'warning' : 'info',
    proteinAdherence: Number(third.toFixed(3)),
    trainingAdherence: 0,
    trend,
    message: active
      ? 'Protein adherence has declined across the last three weeks.'
      : 'Protein adherence is not showing a concerning decline.',
  };
}

export function detectStall(weights: Array<{ value: number; datetime: string }>): StallSignal {
  const sorted = [...weights].sort(
    (left, right) => new Date(left.datetime).getTime() - new Date(right.datetime).getTime(),
  );

  if (sorted.length < 2) {
    return {
      type: 'stall',
      active: false,
      severity: 'info',
      daysWeightFlat: 0,
      message: 'Not enough weight data to detect a stall.',
    };
  }

  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const daysWeightFlat = Math.max(
    0,
    Math.round(
      (new Date(last.datetime).getTime() - new Date(first.datetime).getTime()) /
        (24 * 60 * 60 * 1000),
    ),
  );
  const active = Math.abs(last.value - first.value) <= 0.25 && daysWeightFlat >= 14;

  return {
    type: 'stall',
    active,
    severity: active ? 'warning' : 'info',
    daysWeightFlat,
    message: active ? 'Weight has been effectively flat for at least two weeks.' : 'No stall detected.',
  };
}

export function detectSideEffectCycleCorrelation(
  logs: Array<{ cycleDay: number; severity: number }>,
): SideEffectCycleSignal {
  const byDay = new Map<number, number[]>();
  for (const log of logs) {
    byDay.set(log.cycleDay, [...(byDay.get(log.cycleDay) ?? []), log.severity]);
  }

  let correlatedCycleDay: number | null = null;
  let highestAverage = 0;

  for (const [day, severities] of byDay) {
    if (severities.length < 2) {
      continue;
    }

    const average = severities.reduce((sum, severity) => sum + severity, 0) / severities.length;
    if (average > highestAverage) {
      highestAverage = average;
      correlatedCycleDay = day;
    }
  }

  const active = correlatedCycleDay !== null && highestAverage >= 3;

  return {
    type: 'side_effect_pattern',
    active,
    severity: active ? 'warning' : 'info',
    correlatedCycleDay,
    averageSeverity: Number(highestAverage.toFixed(1)),
    message: active ? 'Side effects cluster around a repeatable cycle day.' : 'No side-effect cycle pattern detected.',
  };
}
