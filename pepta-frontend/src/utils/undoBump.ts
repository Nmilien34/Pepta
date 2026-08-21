// The Home steppers' minus buttons used to be a lie: they decremented the
// optimistic total and then returned early (`if (oz <= 0) return;`), so nothing
// was ever deleted server-side. The number moved, the user believed it, and the
// next refresh silently put the old total back.
//
// A minus tap is an undo of a plus tap, so the honest implementation is to
// delete the log the plus tap created: the most recent not-yet-deleted log of
// that kind, from today, whose amount is exactly what the button removes.
//
// Exact-amount matching is deliberate. If the only water row today is a 16oz
// one from the quick-log sheet, a -8 tap removes nothing rather than silently
// destroying 16oz the user never asked to lose. Nothing-to-undo is a no-op that
// leaves the displayed total alone — still truthful, unlike the old behaviour.

import { localDateOnly } from './cycleWindows';

export type UndoableLog = {
  id: string;
  datetime: string;
  deletedAt?: string | null;
};

/**
 * The log a minus tap should delete, or null when there is nothing to undo.
 *
 * @param amount the positive magnitude the button removes (8, not -8)
 */
export function pickLogToUndo<T extends UndoableLog>(
  rows: readonly T[],
  amount: number,
  amountOf: (row: T) => number,
  now: Date = new Date(),
): T | null {
  const today = localDateOnly(now);
  let best: T | null = null;
  for (const row of rows) {
    if (row.deletedAt) continue;
    if (amountOf(row) !== amount) continue;
    const at = new Date(row.datetime);
    if (Number.isNaN(at.getTime())) continue;
    if (localDateOnly(at) !== today) continue;
    if (!best || at.getTime() > new Date(best.datetime).getTime()) best = row;
  }
  return best;
}
