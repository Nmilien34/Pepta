// The Progress scope — the header pill, and what it governs.
//
// IT REPLACES A PER-CARD TOGGLE. The 7d/30d/90d/1y/All control lived inside
// the Weight card and moved only that chart, so the rest of the screen was
// silently "all time" while the user believed they had picked 30 days. Scope
// is a property of the screen, so it lives in the screen's header.
//
// "SINCE YOU STARTED" IS THE DEFAULT, and it is the one that needs the user's
// own data to name itself: the frame's pill reads "Since Apr 4", not "All".
// Someone eight weeks in is asking "how far have I come", and a fixed window
// answers a different question.
//
// Pure and RN-free.

export type ProgressScopeKey = 'start' | '30d' | '90d' | 'year';

export interface ProgressScopeOption {
  key: ProgressScopeKey;
  /** The menu row: "Since you started", "Last 30 days". */
  label: string;
  /** Days back, or null for "since the first log". */
  days: number | null;
}

export const PROGRESS_SCOPES: readonly ProgressScopeOption[] = [
  { key: 'start', label: 'Since you started', days: null },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: 'year', label: 'This year', days: 365 },
];

/** "Apr 4" — the short form the pill and the menu subtitle both use. */
export function shortDay(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(at);
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * The pill's text. "Since Apr 4" when there is a start date to name, because a
 * date is a fact the user recognises where "All" is a filter setting.
 */
export function scopePillLabel(
  scope: ProgressScopeKey,
  startedAt: string | null,
): string {
  if (scope !== 'start') {
    return PROGRESS_SCOPES.find((option) => option.key === scope)?.label ?? 'All';
  }
  const day = startedAt ? shortDay(startedAt) : '';
  return day ? `Since ${day}` : 'Since you started';
}

/**
 * The menu's second line under "Since you started": "Apr 4 · 20 weeks".
 * Absent when nothing has been logged — there is no start to describe.
 */
export function scopeStartSubtitle(startedAt: string | null, now: Date): string {
  if (!startedAt) return '';
  const from = new Date(startedAt);
  if (Number.isNaN(from.getTime())) return '';
  const weeks = Math.floor((now.getTime() - from.getTime()) / (7 * 86_400_000));
  const day = shortDay(startedAt);
  if (weeks < 1) return day;
  return `${day} · ${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
}

/**
 * The cutoff a scope implies, as a timestamp. null means "everything held" —
 * which for 'start' is the honest reading: the first log IS the start, so
 * there is nothing to clip.
 */
export function scopeCutoff(scope: ProgressScopeKey, now: Date): number | null {
  const days = PROGRESS_SCOPES.find((option) => option.key === scope)?.days ?? null;
  if (days == null) return null;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start.getTime();
}

export function withinScope(
  rows: readonly { datetime: string }[],
  scope: ProgressScopeKey,
  now: Date,
): typeof rows {
  const cutoff = scopeCutoff(scope, now);
  if (cutoff == null) return rows;
  return rows.filter((row) => new Date(row.datetime).getTime() >= cutoff);
}
