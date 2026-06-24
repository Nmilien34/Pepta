import { describe, expect, it } from 'vitest';
import type { HomeResponse, TrackResponse, UserProfileResponse } from '@pepta/shared';
import { buildActivity, buildTodaysLog } from './homeExtras';

const now = new Date(2026, 5, 23, 14, 0, 0);
const todayIso = new Date(2026, 5, 23, 9, 0, 0).toISOString();
const yesterdayIso = new Date(2026, 5, 22, 9, 0, 0).toISOString();

function track(p: Partial<TrackResponse> = {}): TrackResponse {
  return {
    doseLogs: [],
    mealLogs: [],
    waterLogs: [],
    proteinLogs: [],
    activityLogs: [],
    sideEffectLogs: [],
    measurements: [],
    sectionErrors: {},
    ...p,
  } as unknown as TrackResponse;
}

describe('buildActivity', () => {
  it('sums today’s steps + workout, defaults targets', () => {
    const t = track({ activityLogs: [
      { steps: 4000, workoutMinutes: 10, datetime: todayIso, deletedAt: null },
      { steps: 2240, workoutMinutes: 12, datetime: todayIso, deletedAt: null },
      { steps: 9999, workoutMinutes: 99, datetime: yesterdayIso, deletedAt: null },
    ] as unknown as TrackResponse['activityLogs'] });
    const a = buildActivity(t, { dailyStepTarget: 3000 } as unknown as UserProfileResponse, now);
    expect(a.steps).toBe(6240);
    expect(a.workoutMin).toBe(22);
    expect(a.stepTarget).toBe(3000);
    expect(a.workoutTarget).toBe(30);
  });
});

describe('buildTodaysLog', () => {
  it('collects today’s logs across types, newest first, with a weigh-in', () => {
    const t = track({
      doseLogs: [{ compoundId: 'c1', datetime: new Date(2026, 5, 23, 8, 0).toISOString(), deletedAt: null }] as unknown as TrackResponse['doseLogs'],
      mealLogs: [{ foodName: 'Greek yogurt', datetime: new Date(2026, 5, 23, 12, 0).toISOString(), deletedAt: null }] as unknown as TrackResponse['mealLogs'],
      waterLogs: [{ amountOz: 16, datetime: new Date(2026, 5, 23, 13, 0).toISOString(), deletedAt: null }] as unknown as TrackResponse['waterLogs'],
    });
    const home = { activeCompounds: [{ id: 'c1', name: 'Tirzepatide' }], latestWeight: { value: 184, unit: 'lb', datetime: new Date(2026, 5, 23, 7, 0).toISOString() } } as unknown as HomeResponse;
    const chips = buildTodaysLog(t, home, now);
    expect(chips.map((c) => c.kind)).toEqual(['water', 'meal', 'shot', 'weight']);
    expect(chips.find((c) => c.kind === 'shot')!.label).toBe('Tirzepatide');
    expect(chips.find((c) => c.kind === 'weight')!.label).toBe('184 lb');
  });
  it('returns empty with no logs', () => {
    expect(buildTodaysLog(track(), { activeCompounds: [], latestWeight: null } as unknown as HomeResponse, now)).toEqual([]);
  });
});
