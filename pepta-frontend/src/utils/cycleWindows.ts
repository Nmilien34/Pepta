// Cycle on/off windows. The math lives in @pepta/shared (utils/cycleWindows)
// so the backend's nextDoseAt/reminder pausing and this app's week strip,
// month-sheet band, and Track rest card all read ONE implementation and can
// never disagree. This module re-exports it plus the device-timezone helper.

export {
  cycleDayStatus,
  hasPattern,
  isRestDay,
  restWindows,
  type CycleDayStatus,
  type CyclePattern,
  type CyclePhase,
  type RestWindow,
} from '@pepta/shared';

/** Local calendar date of a JS Date as YYYY-MM-DD (device timezone). */
export function localDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
