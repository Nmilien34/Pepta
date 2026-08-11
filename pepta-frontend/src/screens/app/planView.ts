// Pure derivations for the new-user day-one experience: a personalized plan line
// and a getting-started checklist, both composed from the existing HomeResponse
// (profile goal/pace/targets + setupProgress + today's signals). No RN imports.

import type { HomeResponse, TrackResponse } from '@pepta/shared';
import { doseNoun, globalDoseNoun } from './levelSuppression';
import { formatShortDate } from './progressView';

export interface PlanSummary {
  title: string; // "Lose 19 lbs to 165 lbs"
  detail: string; // "Gentle pace · ~1.1 lb/week · goal by Sep 14"
}

const PACE_LABEL: Record<string, string> = { gentle: 'Gentle', steady: 'Steady', ambitious: 'Ambitious' };

export function buildPlanSummary(home: HomeResponse): PlanSummary | null {
  const profile = home.profile;
  const goal = profile?.goalWeight ?? null;
  const current = home.latestWeight?.value ?? profile?.currentWeight ?? null;
  if (!profile || goal == null || current == null) return null;

  const unit = home.latestWeight?.unit ?? profile.weightUnit ?? 'lb';
  const diff = Math.round(Math.abs(current - goal) * 10) / 10;
  const verb = goal <= current ? 'Lose' : 'Reach';
  const title = goal <= current ? `${verb} ${diff} ${unit} to ${goal} ${unit}` : `Reach ${goal} ${unit}`;

  const parts: string[] = [];
  if (profile.goalPace) parts.push(`${PACE_LABEL[profile.goalPace] ?? 'Steady'} pace`);
  const weekly = profile.targetWeeklyLossPercent ? Math.round(current * (profile.targetWeeklyLossPercent / 100) * 10) / 10 : 0;
  if (weekly > 0) parts.push(`~${weekly} ${unit}/week`);
  const by = formatShortDate(profile.estimatedGoalDate ?? '');
  if (by !== '—') parts.push(`goal by ${by}`);

  return { title, detail: parts.join(' · ') };
}

export type LogAction = 'dose' | 'meal' | 'water' | 'weight';

export interface SetupTask {
  key: string;
  label: string;
  done: boolean;
  action: LogAction | null; // null = the (already-done) account row
}

export interface GettingStarted {
  show: boolean;
  tasks: SetupTask[];
  doneCount: number;
  total: number;
}

export function buildGettingStarted(
  home: HomeResponse,
  track?: TrackResponse | null,
): GettingStarted {
  const setup = home.setupProgress;
  const onMed = home.profile?.medicationStatus === 'active' || home.activeCompounds.length > 0;
  const med = home.activeCompounds[0]?.name ?? home.nextDose?.compoundName ?? null;

  const tasks: SetupTask[] = [{ key: 'account', label: 'Create your account', done: true, action: null }];
  if (onMed) {
    tasks.push({
      key: 'shot',
      // Named medication → that compound's own route. Unnamed → the global
      // rule (injection wording only when everything they take is injectable).
      label: med
        ? `Log your first ${med} ${doseNoun(home.activeCompounds[0]?.route)}`
        : `Log your first ${globalDoseNoun(home.activeCompounds)}`,
      // Dose logs, NOT medicationLevels (2026-08-11 audit): the level list
      // excludes unmodelled compounds, so a custom-medication user could log
      // doses forever and never tick this off. Falls back to the old signal
      // only when track hasn't loaded, so nothing regresses mid-fetch.
      done: track
        ? (track.doseLogs ?? []).some((dose) => dose.deletedAt == null)
        : home.medicationLevels.length > 0,
      action: 'dose',
    });
  }
  tasks.push({ key: 'meal', label: 'Log your first meal', done: home.todayCalories > 0 || home.todayProteinGrams > 0, action: 'meal' });
  tasks.push({ key: 'water', label: 'Add a glass of water', done: home.todayWaterOz > 0, action: 'water' });
  tasks.push({ key: 'weight', label: 'Check in your weight', done: home.latestWeight != null, action: 'weight' });

  const doneCount = tasks.filter((t) => t.done).length;
  return {
    // The backend's `unlocked` flag is the authoritative "still onboarding" signal.
    show: !!setup && !setup.unlocked,
    tasks,
    doneCount,
    total: tasks.length,
  };
}
