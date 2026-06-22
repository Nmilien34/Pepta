import { describe, expect, it } from 'vitest';
import {
  detectDoseCycleTrough,
  detectMedicationLevelState,
  detectProteinRetentionRisk,
  detectProteinTrend,
  detectSideEffectCycleCorrelation,
  detectStall,
} from '../../lib/insight-detectors';

describe('insight detectors', () => {
  it('detects medication level state from deterministic estimates', () => {
    expect(detectMedicationLevelState({ currentEstimate: 3, peakEstimate: 10 })).toMatchObject({
      type: 'medication_level',
      severity: 'warning',
    });
  });

  it('detects dose-cycle trough windows', () => {
    expect(detectDoseCycleTrough({ daysSinceLastDose: 6, scheduleIntervalDays: 7 })).toMatchObject({
      type: 'dose_cycle',
      active: true,
    });
  });

  it('detects protein-driven retention risk', () => {
    expect(
      detectProteinRetentionRisk({
        averageProteinGrams: 75,
        proteinTargetGrams: 125,
        resistanceSessions: 1,
        resistanceSessionTarget: 3,
      }),
    ).toMatchObject({ type: 'protein_retention', severity: 'warning' });
  });

  it('detects stalls from flat weights', () => {
    expect(
      detectStall([
        { value: 200, datetime: '2026-06-01T00:00:00.000Z' },
        { value: 199.9, datetime: '2026-06-15T00:00:00.000Z' },
      ]),
    ).toMatchObject({ type: 'stall', active: true, daysWeightFlat: 14 });
  });

  it('detects side-effect correlation to cycle day', () => {
    expect(
      detectSideEffectCycleCorrelation([
        { cycleDay: 2, severity: 4 },
        { cycleDay: 2, severity: 5 },
        { cycleDay: 5, severity: 2 },
      ]),
    ).toMatchObject({ type: 'side_effect_pattern', correlatedCycleDay: 2 });
  });

  it('detects declining protein adherence across at least three weeks', () => {
    expect(
      detectProteinTrend([{ adherence: 0.92 }, { adherence: 0.78 }, { adherence: 0.61 }]),
    ).toMatchObject({
      type: 'protein_retention',
      active: true,
      trend: 'declining',
    });
  });
});
