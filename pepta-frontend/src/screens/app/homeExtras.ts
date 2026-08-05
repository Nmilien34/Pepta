// Pure derivations for the Home "Activity" and "Today's Log" cards — composed
// from the track logs (+ home's latest weight). No RN imports → testable.

import type { HomeRangeKey, HomeResponse, TrackResponse, UserProfileResponse } from '@pepta/shared';
import { measurementLabel } from './progressView';

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// DECLARED range semantics (2026-08-05, mirrors backend lib/homeRange.ts):
// every range is a ROLLING window ending today — month = past 30 days from
// ask, not the calendar month — cut at local midnight. The backend cuts at
// the same boundaries because the app sends the device zone with GET /home.
const RANGE_DAYS: Record<HomeRangeKey, number> = { today: 1, week: 7, month: 30, year: 365 };

function rangeStart(range: HomeRangeKey, now: Date): Date {
  const day = startOfLocalDay(now);
  const start = new Date(day);
  start.setDate(day.getDate() - (RANGE_DAYS[range] - 1));
  return start;
}

function rangeDayCount(range: HomeRangeKey): number {
  return RANGE_DAYS[range];
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
  rangeTotals?: HomeResponse['rangeTotals'] | null,
): ActivitySummary {
  const days = rangeDayCount(range);
  // Server totals win for week/month/year: they cover the full window, while
  // the /track payload is capped (30 days / 100 rows per type), which silently
  // undercounts long ranges for heavy loggers. 'today' stays locally computed
  // — the cap can't bite a single day, and the local sum includes optimistic
  // just-logged rows the server hasn't confirmed yet.
  const serverTotals =
    range !== 'today' && rangeTotals?.key === range && typeof rangeTotals.steps === 'number'
      ? rangeTotals
      : null;
  const items = serverTotals
    ? []
    : (track?.activityLogs ?? []).filter((a) => a.deletedAt == null && inLocalRange(a.datetime, now, range));
  return {
    steps: serverTotals ? serverTotals.steps ?? 0 : items.reduce((s, a) => s + (a.steps ?? 0), 0),
    stepTarget: (profile?.dailyStepTarget && profile.dailyStepTarget > 0 ? profile.dailyStepTarget : 8000) * days,
    workoutMin: serverTotals
      ? serverTotals.workoutMinutes ?? 0
      : items.reduce((s, a) => s + (a.workoutMinutes ?? 0), 0),
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
