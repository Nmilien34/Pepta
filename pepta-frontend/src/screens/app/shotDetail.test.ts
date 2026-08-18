import { describe, expect, it } from 'vitest';
import { makeHome } from '../../mocks/home';
import { buildShotWindow, cadenceLabel, windowLabel } from './shotDetail';

const NOW = new Date(2026, 7, 20, 12, 0, 0); // Thu Aug 20 2026, noon local
const at = (day: number, hour = 9) => new Date(2026, 7, day, hour, 0, 0).toISOString();

const home = (over: Record<string, unknown> = {}) =>
  makeHome({
    activeCompounds: [
      { id: 'c1', name: 'Ozempic', route: 'injection', doseUnit: 'mg' },
      { id: 'c2', name: 'BPC-157', route: 'injection', doseUnit: 'mcg' },
    ] as never,
    ...over,
  });

const track = (over: Record<string, unknown> = {}) =>
  ({
    doseLogs: [], mealLogs: [], waterLogs: [], proteinLogs: [],
    activityLogs: [], sideEffectLogs: [], measurements: [], weightLogs: [],
    sectionErrors: {}, ...over,
  }) as never;

const dose = (id: string, day: number, over: Record<string, unknown> = {}) => ({
  id, compoundId: 'c1', amount: 0.5, unit: 'mg', datetime: at(day),
  injectionSite: 'abdomen_left', deletedAt: null, ...over,
});

// Hour matters: the window opens at the DOSE time (09:00), so a fixture at
// 07:00 belongs to the previous shot. Callers wanting a reading inside the
// window pass an hour after the dose.
const weight = (id: string, day: number, value: number, hour = 12) => ({
  id, value, unit: 'lb', datetime: at(day, hour), deletedAt: null,
});

const build = (doseId: string, over: Record<string, unknown> = {}) =>
  buildShotWindow({ doseId, home: home(), now: NOW, track: track(over) });

describe('the window is this shot until the next one', () => {
  it('ends at the NEXT dose, not at today', () => {
    const shot = build('d1', {
      doseLogs: [dose('d1', 6), dose('d2', 13)],
      weightLogs: [weight('w1', 6, 230), weight('w2', 12, 227), weight('w3', 19, 220)],
    })!;
    // 220 falls after the second shot: counting it here would credit shot 1
    // with a loss that belongs to shot 2.
    expect(shot.windowDays).toBe(7);
    expect(shot.weight).toEqual({ from: 230, to: 227, delta: -3, unit: 'lb', readings: 2 });
  });

  it('runs to NOW for the most recent shot', () => {
    const shot = build('d2', { doseLogs: [dose('d1', 6), dose('d2', 13)] })!;
    expect(shot.isLatest).toBe(true);
    expect(shot.windowDays).toBe(7); // Aug 13 09:00 → Aug 20 12:00
  });

  it('is half-open, so the next shot’s own weigh-in is not double counted', () => {
    const logs = [weight('w1', 6, 230), weight('w2', 13, 225, 7), weight('w3', 17, 223)];

    // The Aug 13 weigh-in is at 07:00, BEFORE the 09:00 dose, so it belongs to
    // shot 1 — the boundary is the dose time, not the calendar day.
    const first = build('d1', { doseLogs: [dose('d1', 6), dose('d2', 13)], weightLogs: logs })!;
    expect(first.weight).toMatchObject({ from: 230, to: 225 });

    // ...and it is NOT counted a second time as shot 2's starting point.
    const second = build('d2', { doseLogs: [dose('d1', 6), dose('d2', 13)], weightLogs: logs })!;
    expect(second.weight).toBeNull(); // only the Aug 17 reading lands here
  });

  it('ignores doses of a DIFFERENT compound when finding the next one', () => {
    // A daily BPC-157 shot in the middle of a weekly Ozempic gap must not cut
    // that gap down to one day.
    const shot = build('d1', {
      doseLogs: [
        dose('d1', 6),
        dose('other', 8, { compoundId: 'c2', unit: 'mcg', amount: 250 }),
        dose('d2', 13),
      ],
    })!;
    expect(shot.windowDays).toBe(7);
  });

  it('survives a dose logged in the future without going negative', () => {
    const shot = build('future', { doseLogs: [dose('future', 25)] })!;
    expect(shot.windowDays).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(shot.windowDays)).toBe(true);
  });
});

describe('the numbers are the user’s own records', () => {
  it('averages calories and protein PER DAY, not per entry', () => {
    const shot = build('d1', {
      doseLogs: [dose('d1', 13)],
      mealLogs: [
        { id: 'm1', foodName: 'Eggs', calories: 400, protein: 30, datetime: at(13, 10), deletedAt: null },
        { id: 'm2', foodName: 'Chicken', calories: 600, protein: 50, datetime: at(13, 18), deletedAt: null },
        { id: 'm3', foodName: 'Soup', calories: 200, protein: 10, datetime: at(14, 12), deletedAt: null },
      ],
    })!;
    // Two days of eating: (1000 + 200) / 2 — NOT 1200/3, which would make a
    // big day look like a small one.
    expect(shot.avgCalories).toBe(600);
    expect(shot.avgProtein).toBe(45);
  });

  it('counts protein from the standalone counter as well as from meals', () => {
    const shot = build('d1', {
      doseLogs: [dose('d1', 13)],
      mealLogs: [{ id: 'm1', foodName: 'Eggs', calories: 400, protein: 30, datetime: at(13, 10), deletedAt: null }],
      proteinLogs: [{ id: 'p1', grams: 20, datetime: at(13, 20), deletedAt: null }],
    })!;
    expect(shot.avgProtein).toBe(50); // one day, 30 + 20
  });

  it('reports no average rather than zero when nothing was logged', () => {
    const shot = build('d1', { doseLogs: [dose('d1', 13)] })!;
    expect(shot.avgCalories).toBeNull();
    expect(shot.avgProtein).toBeNull();
  });

  it('needs two weigh-ins before it claims a change', () => {
    const shot = build('d1', {
      doseLogs: [dose('d1', 13)],
      weightLogs: [weight('w1', 14, 228)],
    })!;
    // One reading is a weight, not a change. Reporting 0 lb would be a lie.
    expect(shot.weight).toBeNull();
  });

  it('never resurrects a soft-deleted log', () => {
    const shot = build('d1', {
      doseLogs: [dose('d1', 13)],
      weightLogs: [
        weight('w1', 13, 230, 10),
        { ...weight('w2', 15, 200), deletedAt: at(15, 10) },
        weight('w3', 17, 228),
      ],
      mealLogs: [{ id: 'm1', foodName: 'X', calories: 9999, protein: 0, datetime: at(14), deletedAt: at(14, 10) }],
    })!;
    expect(shot.weight?.to).toBe(228);
    expect(shot.avgCalories).toBeNull();
  });

  it('collects side effects logged inside the window, with severity', () => {
    const shot = build('d1', {
      doseLogs: [dose('d1', 13), dose('d2', 20)],
      sideEffectLogs: [
        { id: 's1', types: ['nausea'], severity: 2, datetime: at(14, 18), deletedAt: null },
        { id: 's2', types: ['fatigue'], severity: 1, datetime: at(25, 9), deletedAt: null }, // next window
      ],
    })!;
    expect(shot.sideEffects).toHaveLength(1);
    expect(shot.sideEffects[0]).toMatchObject({ label: 'Nausea', severity: 2 });
  });
});

describe('the shot’s own record', () => {
  it('reads amount, site and notes off the dose', () => {
    const shot = build('d1', {
      doseLogs: [dose('d1', 13, { amount: 2.5, injectionSite: 'thigh_right', notes: '  felt fine  ' })],
    })!;
    expect(shot.amountLabel).toBe('2.5 mg');
    expect(shot.site).toBe('Right Thigh');
    expect(shot.notes).toBe('felt fine');
  });

  it('has no site for an oral dose instead of inventing one', () => {
    const shot = build('d1', { doseLogs: [dose('d1', 13, { injectionSite: undefined })] })!;
    expect(shot.site).toBeNull();
  });

  it('treats a whitespace-only note as no note', () => {
    const shot = build('d1', { doseLogs: [dose('d1', 13, { notes: '   ' })] })!;
    expect(shot.notes).toBeNull();
  });

  it('returns null for a dose that does not exist or was deleted', () => {
    expect(build('nope', { doseLogs: [dose('d1', 13)] })).toBeNull();
    expect(build('d1', { doseLogs: [dose('d1', 13, { deletedAt: at(13, 10) })] })).toBeNull();
    expect(buildShotWindow({ doseId: 'd1', track: null, home: home(), now: NOW })).toBeNull();
  });
});

describe('the curve is sliced, never re-derived', () => {
  const curve = (from: number, to: number) =>
    Array.from({ length: (to - from) * 4 + 1 }, (_, i) => ({
      datetime: new Date(2026, 7, from, 0, 0, 0, 0).getTime() + i * 6 * 3600_000,
      level: 1,
    })).map((p) => ({ datetime: new Date(p.datetime).toISOString(), level: p.level }));

  it('keeps only the points inside the window', () => {
    const shot = buildShotWindow({
      doseId: 'd1',
      now: NOW,
      home: home({ medicationLevels: [{ compoundId: 'c1', curve: curve(13, 27) }] as never }),
      track: track({ doseLogs: [dose('d1', 13), dose('d2', 20)] }),
    })!;
    const days = new Set(shot.curve.map((p) => p.datetime.slice(0, 10)));
    expect(shot.curve.length).toBeGreaterThan(2);
    expect([...days].sort()[0]! >= '2026-08-13').toBe(true);
    expect([...days].sort().at(-1)! <= '2026-08-20').toBe(true);
  });

  it('shows NO chart when the backend curve does not reach the window', () => {
    // The curve only spans now±7 days. An older shot gets an honest blank,
    // not a client-side re-derivation of the pharmacokinetics.
    const shot = buildShotWindow({
      doseId: 'old',
      now: NOW,
      home: home({ medicationLevels: [{ compoundId: 'c1', curve: curve(13, 27) }] as never }),
      track: track({ doseLogs: [dose('old', 1), dose('mid', 10)] }),
    })!;
    expect(shot.curve).toEqual([]);
  });

  it('drops a single stray point rather than drawing a line from it', () => {
    const shot = buildShotWindow({
      doseId: 'd1',
      now: NOW,
      home: home({ medicationLevels: [{ compoundId: 'c1', curve: [{ datetime: at(13, 12), level: 1 }] as never }] as never }),
      track: track({ doseLogs: [dose('d1', 13), dose('d2', 20)] }),
    })!;
    expect(shot.curve).toEqual([]);
  });
});

describe('labels', () => {
  it('describes the gap since the previous shot', () => {
    const seven = build('d2', { doseLogs: [dose('d1', 6), dose('d2', 13)] })!;
    expect(cadenceLabel(seven)).toBe('7 days after your last shot');

    const first = build('d1', { doseLogs: [dose('d1', 13)] })!;
    expect(cadenceLabel(first)).toBe('Your first logged shot');
    expect(first.daysSincePrevious).toBeNull();
  });

  it('speaks in past tense for a finished window and present for the live one', () => {
    const past = build('d1', { doseLogs: [dose('d1', 6), dose('d2', 13)] })!;
    const live = build('d2', { doseLogs: [dose('d1', 6), dose('d2', 13)] })!;
    expect(windowLabel(past)).toBe('Over the 7 days after');
    expect(windowLabel(live)).toBe('In the 7 days since');
  });
});
