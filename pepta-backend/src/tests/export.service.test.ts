import { describe, expect, it, vi } from 'vitest';
import { exportDoseLogsCsv } from '../services/export.service';

const mocks = vi.hoisted(() => ({
  doseLogs: [] as unknown[],
  compounds: [] as unknown[],
}));

vi.mock('../models', () => ({
  DoseLogModel: {
    find: () => ({ sort: () => Promise.resolve(mocks.doseLogs) }),
  },
  CompoundModel: {
    find: () => Promise.resolve(mocks.compounds),
  },
}));

function seed() {
  mocks.compounds = [{ _id: { toString: () => 'c1' }, name: 'Tirzepatide' }];
  mocks.doseLogs = [
    {
      compoundId: { toString: () => 'c1' },
      datetime: new Date('2026-07-25T20:00:00.000Z'),
      amount: 5,
      unit: 'mg',
      injectionSite: 'abdomen_left',
      sideEffects: ['nausea', 'sulfur_burps'],
      notes: 'felt fine, mostly',
    },
    {
      compoundId: { toString: () => 'missing' },
      datetime: new Date('2026-07-26T08:30:00.000Z'),
      amount: 250,
      unit: 'mcg',
      injectionSite: undefined,
      sideEffects: undefined,
      notes: undefined,
    },
  ];
}

describe('exportDoseLogsCsv', () => {
  it('builds the doctor-ready table with side effects, quoting as needed', async () => {
    seed();
    const csv = await exportDoseLogsCsv('u1');
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe(
      'date (UTC),time,compound,amount,unit,injection site,side effects,notes',
    );
    expect(lines[1]).toBe(
      '2026-07-25,20:00,Tirzepatide,5,mg,abdomen left,nausea; sulfur burps,"felt fine, mostly"',
    );
    // Unknown compound + empty optionals stay graceful.
    expect(lines[2]).toBe('2026-07-26,08:30,Unknown,250,mcg,,,');
  });

  it('localizes date/time when a valid IANA zone is passed', async () => {
    seed();
    const csv = await exportDoseLogsCsv('u1', 'America/New_York');
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toContain('date (America/New_York)');
    // 20:00 UTC on Jul 25 is 16:00 EDT the same day.
    expect(lines[1]!.startsWith('2026-07-25,16:00,')).toBe(true);
  });

  it('falls back to UTC on a nonsense timezone', async () => {
    seed();
    const csv = await exportDoseLogsCsv('u1', 'Not/AZone');
    expect(csv.split('\r\n')[0]).toContain('date (UTC)');
  });
});
