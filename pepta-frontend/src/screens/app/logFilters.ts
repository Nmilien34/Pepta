// Scoping and filtering "Your log".
//
// WHAT SOMEBODY ACTUALLY COMES HERE FOR. Three questions, in rough order of
// how often they get asked:
//
//   "Did I take last week's shot?"        → Doses, this week
//   "When did the nausea start?"          → Side effects, all time
//   "Have I been hitting protein?"        → Food, this month
//
// All three are a WHAT crossed with a WHEN, which is why there are two
// controls rather than one long menu: the pill answers when, the filter
// answers what, and they compose.
//
// KINDS ARE GROUPED, NOT LISTED RAW. There are eight ActivityKinds and nobody
// thinks in eight — protein and meals are both "food", weight and measurements
// are both "body". A filter list that mirrors the schema would make the user
// tick two boxes to ask one question.
//
// Pure and RN-free.

import type { ActivityDay, ActivityKind } from './activityFeed';

export type LogScope = 'today' | 'week' | 'month' | 'all';

export interface LogScopeOption {
  key: LogScope;
  label: string;
  /** Days back from today, inclusive. null = everything held. */
  days: number | null;
}

export const LOG_SCOPES: readonly LogScopeOption[] = [
  { key: 'today', label: 'Today', days: 1 },
  { key: 'week', label: 'This week', days: 7 },
  { key: 'month', label: 'This month', days: 30 },
  { key: 'all', label: 'All time', days: null },
];

export type LogGroupKey = 'dose' | 'body' | 'food' | 'water' | 'sideEffect' | 'activity';

export interface LogGroup {
  key: LogGroupKey;
  label: string;
  kinds: readonly ActivityKind[];
}

/** Doses first: it is the reason this app exists, and the row people scan for. */
export const LOG_GROUPS: readonly LogGroup[] = [
  { key: 'dose', label: 'Doses', kinds: ['dose'] },
  { key: 'body', label: 'Weight & measurements', kinds: ['weight', 'measurement'] },
  { key: 'food', label: 'Food & protein', kinds: ['meal', 'protein'] },
  { key: 'water', label: 'Water', kinds: ['water'] },
  { key: 'sideEffect', label: 'Side effects', kinds: ['sideEffect'] },
  { key: 'activity', label: 'Activity', kinds: ['activity'] },
];

const GROUP_OF = new Map<ActivityKind, LogGroupKey>(
  LOG_GROUPS.flatMap((group) => group.kinds.map((kind) => [kind, group.key] as const)),
);

export interface LogFilter {
  scope: LogScope;
  /**
   * Groups to show. EMPTY MEANS EVERY GROUP, not none — "no filter" is the
   * resting state, and making the user tick all six to see everything would
   * invert the common case.
   */
  groups: readonly LogGroupKey[];
}

export const NO_FILTER: LogFilter = { scope: 'all', groups: [] };

export function isFiltered(filter: LogFilter): boolean {
  return filter.scope !== 'all' || filter.groups.length > 0;
}

/** Toggling the last remaining group clears the filter rather than emptying it. */
export function toggleGroup(filter: LogFilter, key: LogGroupKey): LogFilter {
  const on = filter.groups.includes(key);
  const groups = on ? filter.groups.filter((group) => group !== key) : [...filter.groups, key];
  return { ...filter, groups };
}

function scopeCutoff(scope: LogScope, now: Date): number | null {
  const option = LOG_SCOPES.find((candidate) => candidate.key === scope);
  if (!option || option.days == null) return null;
  // From the START of the day `days - 1` back, so "This week" means seven
  // calendar days including today rather than a rolling 168 hours — which
  // would drop this morning's log at 8am tomorrow.
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (option.days - 1));
  return start.getTime();
}

export function filterFeed(
  days: readonly ActivityDay[],
  filter: LogFilter,
  now = new Date(),
): ActivityDay[] {
  const cutoff = scopeCutoff(filter.scope, now);
  const wanted = new Set(filter.groups);

  return days
    .map((day) => ({
      ...day,
      entries: day.entries.filter((entry) => {
        if (cutoff != null && new Date(entry.datetime).getTime() < cutoff) return false;
        if (wanted.size === 0) return true;
        const group = GROUP_OF.get(entry.kind);
        return group != null && wanted.has(group);
      }),
    }))
    // A day whose every entry was filtered out is not an empty day — it is a
    // day that does not belong in this answer.
    .filter((day) => day.entries.length > 0);
}

/** How many entries each group would contribute AT THE CURRENT SCOPE. */
export function groupCounts(
  days: readonly ActivityDay[],
  scope: LogScope,
  now = new Date(),
): Record<LogGroupKey, number> {
  const counts = Object.fromEntries(LOG_GROUPS.map((group) => [group.key, 0])) as Record<
    LogGroupKey,
    number
  >;
  const scoped = filterFeed(days, { scope, groups: [] }, now);
  for (const day of scoped) {
    for (const entry of day.entries) {
      const group = GROUP_OF.get(entry.kind);
      if (group) counts[group] += 1;
    }
  }
  return counts;
}

export function entryCount(days: readonly ActivityDay[]): number {
  return days.reduce((total, day) => total + day.entries.length, 0);
}

/** The pill's own text — the scope, since that is what it controls. */
export function scopeLabel(scope: LogScope): string {
  return LOG_SCOPES.find((option) => option.key === scope)?.label ?? 'All time';
}

/**
 * What an empty result means, said specifically. "Nothing here" leaves the
 * user unsure whether they logged nothing or filtered everything out.
 */
export function emptyLine(filter: LogFilter): string {
  const when = filter.scope === 'all' ? '' : ` ${scopeLabel(filter.scope).toLowerCase()}`;
  if (filter.groups.length === 0) {
    return `Nothing logged${when || ' yet'}.`;
  }
  const names = LOG_GROUPS.filter((group) => filter.groups.includes(group.key))
    .map((group) => group.label.toLowerCase())
    .join(' or ');
  return `No ${names}${when}.`;
}
