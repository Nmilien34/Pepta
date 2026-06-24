// Pure derivations for the Home "Activity" and "Today's Log" cards — composed
// from the track logs (+ home's latest weight). No RN imports → testable.

import type { HomeRangeKey, HomeResponse, TrackResponse, UserProfileResponse } from '@pepta/shared';
import { measurementLabel } from './progressView';

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function rangeStart(range: HomeRangeKey, now: Date): Date {
  const day = startOfLocalDay(now);
  if (range === 'week') {
    const start = new Date(day);
    start.setDate(day.getDate() - day.getDay());
    return start;
  }
  if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === 'year') return new Date(now.getFullYear(), 0, 1);
  return day;
}

function rangeDayCount(range: HomeRangeKey, now: Date): number {
  const start = rangeStart(range, now);
  const end = startOfLocalDay(now);
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);
}

function inLocalRange(iso: string, now: Date, range: HomeRangeKey): boolean {
  const d = new Date(iso);
  return d >= rangeStart(range, now) && d < new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}

export interface ActivitySummary {
  steps: number;
  stepTarget: number;
  workoutMin: number;
  workoutTarget: number;
}

export function buildActivity(
  track: TrackResponse | null,
  profile: UserProfileResponse | null,
  now: Date,
  range: HomeRangeKey = 'today',
): ActivitySummary {
  const days = rangeDayCount(range, now);
  const items = (track?.activityLogs ?? []).filter((a) => a.deletedAt == null && inLocalRange(a.datetime, now, range));
  return {
    steps: items.reduce((s, a) => s + (a.steps ?? 0), 0),
    stepTarget: (profile?.dailyStepTarget && profile.dailyStepTarget > 0 ? profile.dailyStepTarget : 8000) * days,
    workoutMin: items.reduce((s, a) => s + (a.workoutMinutes ?? 0), 0),
    workoutTarget: 30 * days,
  };
}

export type LogKind = 'shot' | 'meal' | 'water' | 'protein' | 'weight' | 'sideEffect' | 'measurement' | 'activity';

export interface LogChip {
  kind: LogKind;
  label: string;
}

export function buildTodaysLog(
  track: TrackResponse | null,
  home: HomeResponse | null,
  now: Date,
  range: HomeRangeKey = 'today',
): LogChip[] {
  const out: { chip: LogChip; t: number }[] = [];
  const add = (kind: LogKind, label: string, iso: string) => {
    if (inLocalRange(iso, now, range)) out.push({ chip: { kind, label }, t: new Date(iso).getTime() });
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
