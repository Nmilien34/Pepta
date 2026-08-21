import { describe, expect, it } from 'vitest';
import { pickLogToUndo, type UndoableLog } from './undoBump';

type Water = UndoableLog & { amountOz: number };

const NOW = new Date('2026-08-21T15:00:00');
const oz = (row: Water) => row.amountOz;

function row(id: string, amountOz: number, datetime: string, deletedAt?: string): Water {
  return { id, amountOz, datetime, deletedAt: deletedAt ?? null };
}

describe('pickLogToUndo', () => {
  it('picks the most recent exact-amount log from today', () => {
    const rows = [
      row('early', 8, '2026-08-21T08:00:00'),
      row('late', 8, '2026-08-21T14:00:00'),
      row('middle', 8, '2026-08-21T11:00:00'),
    ];

    expect(pickLogToUndo(rows, 8, oz, NOW)?.id).toBe('late');
  });

  it('ignores logs from other days', () => {
    const rows = [row('yesterday', 8, '2026-08-20T23:59:00')];

    expect(pickLogToUndo(rows, 8, oz, NOW)).toBeNull();
  });

  it('ignores already-deleted logs', () => {
    const rows = [row('gone', 8, '2026-08-21T14:00:00', '2026-08-21T14:05:00')];

    expect(pickLogToUndo(rows, 8, oz, NOW)).toBeNull();
  });

  it('never removes more than the button promises', () => {
    // A 16oz quick-log row must not be destroyed by a -8 tap.
    const rows = [row('big', 16, '2026-08-21T14:00:00')];

    expect(pickLogToUndo(rows, 8, oz, NOW)).toBeNull();
  });

  it('tolerates an unparseable datetime instead of throwing', () => {
    const rows = [row('bad', 8, 'not-a-date'), row('good', 8, '2026-08-21T09:00:00')];

    expect(pickLogToUndo(rows, 8, oz, NOW)?.id).toBe('good');
  });
});
