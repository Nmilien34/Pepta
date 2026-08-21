// The crafting checklist after `needs` was cut (2026-08-21).
//
// The rows used to lead with the user's picks from a mandatory multi-select
// two turns before the paywall — an answer that reached nothing else in the
// app. They are now derived from answers we already hold, so the list keeps
// its personalised length without the screen.
//
// These tests pin the two things that could quietly rot: a row must never
// promise something the user's own answers do not support, and the list must
// never repeat itself (picking `schedule` used to produce the shot-day row
// twice for an active weekly injector).

import { describe, expect, it } from 'vitest';
import { buildCraftingSteps } from './craftingSteps';
import { MEDICATION_CATALOG } from '../../data/medicationCatalog';

type Answers = Parameters<typeof buildCraftingSteps>[0];

// A REAL catalog row, not a hand-built literal: the row copy interpolates
// `name` and branches on `halfLifeDays`, so a fixture that drifts from the
// shipped catalog would test copy no user can reach.
const MED = MEDICATION_CATALOG.find((m) => m.halfLifeDays != null)!;

const base = (over: Partial<Answers> = {}): Answers =>
  ({
    journeyStage: 'active',
    body: { units: 'imperial', height: 66, weight: 184 },
    goalWeight: 160,
    pace: 0.5,
    ...over,
  }) as Answers;

describe('buildCraftingSteps', () => {
  it('never repeats a row', () => {
    // The bug the cut removed: `schedule` gave "Shot-day reminders — timed to
    // you" and the tail then appended "Shot-day reminders — Mondays".
    const rows = buildCraftingSteps(
      base({ medication: MED, deviceType: 'syringe_vial', shotDays: [1] }),
    );

    expect(new Set(rows).size).toBe(rows.length);
  });

  it('keeps the list long enough to still feel crafted', () => {
    const rows = buildCraftingSteps(
      base({ medication: MED, deviceType: 'syringe_vial', shotDays: [1] }),
    );

    // Was 5–6 with the picks. CraftingScreen ticks these off over 3.2s, so a
    // two-row list reads as a stall rather than a build.
    expect(rows.length).toBeGreaterThanOrEqual(5);
  });

  it('offers the mixing calculator only to someone drawing from a vial', () => {
    const vial = buildCraftingSteps(base({ deviceType: 'syringe_vial' }));
    const pen = buildCraftingSteps(base({ deviceType: 'auto_injector' }));

    expect(vial.some((r: string) => r.includes('mixing math'))).toBe(true);
    expect(pen.some((r: string) => r.includes('mixing math'))).toBe(false);
  });

  it('promises a level curve only when one can actually be drawn', () => {
    // lastShot lives in the skip-gated dosing block, so a starting-soon user
    // has given nothing to model from.
    const active = buildCraftingSteps(base({ medication: MED }));
    const soon = buildCraftingSteps(
      base({ journeyStage: 'starting_soon', medication: MED }),
    );

    expect(active).toContain(`${MED.name} — levels modelled from your last dose`);
    expect(soon).toContain(`${MED.name} — tracking ready`);
    expect(soon.some((r: string) => r.includes('last dose'))).toBe(false);
  });

  it('says nothing about a compound when the user named none', () => {
    const rows = buildCraftingSteps(base({ journeyStage: 'none' }));

    expect(rows.some((r: string) => r.includes(MED.name))).toBe(false);
    // Still has something to show: the universal row plus their numbers.
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('never promises shot-day reminders to an oral user', () => {
    const rows = buildCraftingSteps(
      base({ medication: MED, route: 'oral', shotDays: [1] }),
    );

    expect(rows.some((r: string) => r.includes('Shot-day'))).toBe(false);
    expect(rows.some((r: string) => r.includes('Dose-day'))).toBe(true);
  });

  it('carries their own numbers, not defaults, when they gave them', () => {
    const rows = buildCraftingSteps(base({ medication: MED }));

    expect(rows.some((r: string) => r.startsWith('Muscle guard —'))).toBe(true);
    expect(rows.some((r: string) => r.startsWith('Goal path — 184 → 160'))).toBe(true);
  });
});
