// Pure derivations for the Home "Activity" and "Today's Log" cards — composed
// from the track logs (+ home's latest weight). No RN imports → testable.

import type { HomeResponse, TrackResponse, UserProfileResponse } from '@pepta/shared';
import { measurementLabel } from './progressView';

function sameLocalDay(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export interface ActivitySummary {
  steps: number;
  stepTarget: number;
  workoutMin: number;
  workoutTarget: number;
}

export function buildActivity(track: TrackResponse | null, profile: UserProfileResponse | null, now: Date): ActivitySummary {
  const today = (track?.activityLogs ?? []).filter((a) => a.deletedAt == null && sameLocalDay(a.datetime, now));
  return {
    steps: today.reduce((s, a) => s + (a.steps ?? 0), 0),
    stepTarget: profile?.dailyStepTarget && profile.dailyStepTarget > 0 ? profile.dailyStepTarget : 8000,
    workoutMin: today.reduce((s, a) => s + (a.workoutMinutes ?? 0), 0),
    workoutTarget: 30,
  };
}

export type LogKind = 'shot' | 'meal' | 'water' | 'protein' | 'weight' | 'sideEffect' | 'measurement' | 'activity';

export interface LogChip {
  kind: LogKind;
  label: string;
}

export function buildTodaysLog(track: TrackResponse | null, home: HomeResponse | null, now: Date): LogChip[] {
  const out: { chip: LogChip; t: number }[] = [];
  const add = (kind: LogKind, label: string, iso: string) => {
    if (sameLocalDay(iso, now)) out.push({ chip: { kind, label }, t: new Date(iso).getTime() });
  };
  const compoundName = (id: string) => home?.activeCompounds.find((c) => c.id === id)?.name ?? 'Shot';

  if (track) {
    for (const d of track.doseLogs) if (d.deletedAt == null) add('shot', compoundName(d.compoundId), d.datetime);
    for (const m of track.mealLogs) if (m.deletedAt == null) add('meal', m.foodName, m.datetime);
    for (const w of track.waterLogs) if (w.deletedAt == null) add('water', `${w.amountOz} oz`, w.datetime);
    for (const p of track.proteinLogs) if (p.deletedAt == null) add('protein', `${p.grams} g`, p.datetime);
    for (const a of track.activityLogs) if (a.deletedAt == null) add('activity', a.steps ? `${a.steps} steps` : 'Workout', a.datetime);
    for (const s of track.sideEffectLogs) if (s.deletedAt == null) add('sideEffect', 'Side effect', s.datetime);
    for (const me of track.measurements) if (me.deletedAt == null) add('measurement', measurementLabel(me.type), me.datetime);
  }
  // Weight lives in /progress, but home's latestWeight covers a same-day weigh-in.
  if (home?.latestWeight) add('weight', `${home.latestWeight.value} ${home.latestWeight.unit}`, home.latestWeight.datetime);

  return out.sort((a, b) => b.t - a.t).map((x) => x.chip);
}
