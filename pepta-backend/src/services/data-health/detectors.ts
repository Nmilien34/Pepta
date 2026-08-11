/**
 * The three launch detectors, in priority order.
 *
 * D1 duplicates before D2 missing times before D3 renames: duplicates make
 * reminders wrong (two records, two schedules, two countdowns for one real
 * medication), a missing dose time makes them mistimed, and a placeholder name
 * only makes the app read badly. Worst first.
 */

import type { DataHealthCard } from "@pepta/shared";
import {
  liveDoseCount,
  normalizeCompoundName,
  type DataHealthContext,
  type DataHealthSchedule,
  type Detector,
  type DetectorHit,
} from "./framework";

/** The medication picker's escape hatch, as onboarding writes it through. */
const UNIDENTIFIED_COMPOUND_NAME = "something else";

function scheduleFor(
  context: DataHealthContext,
  compoundId: string,
): DataHealthSchedule | null {
  return (
    context.schedules.find((schedule) => schedule.compoundId === compoundId) ??
    null
  );
}

/** "Daily at 9:00 AM" / "Weekly" — what the chooser shows under each option. */
function summarizeSchedule(schedule: DataHealthSchedule | null): string | null {
  if (!schedule) return null;
  const frequency =
    schedule.frequency.charAt(0).toUpperCase() + schedule.frequency.slice(1);
  if (schedule.timesOfDay.length === 0) return frequency;
  return `${frequency} at ${schedule.timesOfDay.join(", ")}`;
}

/**
 * D1 — the same medication recorded twice.
 *
 * Match is normalized name + route, which is deliberately narrow: two records
 * that differ only in dose are the classic retry, but they are ALSO what a
 * titration step looks like. That ambiguity is why nothing here merges on its
 * own — the card shows the differences and the user decides, including "keep
 * both".
 */
export const duplicateCompounds: Detector = {
  name: "duplicate-compounds",
  detect(context): DetectorHit | null {
    const groups = new Map<string, typeof context.compounds>();

    for (const compound of context.compounds) {
      const key = `${normalizeCompoundName(compound.name)}|${compound.route ?? ""}`;
      const group = groups.get(key);
      if (group) group.push(compound);
      else groups.set(key, [compound]);
    }

    for (const group of groups.values()) {
      if (group.length < 2) continue;

      const ordered = [...group].sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      );
      const ids = ordered.map((compound) => compound.id);

      return {
        subjectId: ids[0]!,
        // Every id in the group: a THIRD duplicate appearing changes the hash,
        // so a card the user dismissed comes back with the new fact.
        facts: [...ids].sort(),
        card: (key): DataHealthCard => ({
          detector: "duplicate-compounds",
          key,
          candidates: ordered.map((compound) => ({
            compoundId: compound.id,
            name: compound.name,
            route: compound.route,
            plannedDose: compound.plannedDose,
            doseUnit: compound.doseUnit,
            doseCount: liveDoseCount(context, compound.id),
            scheduleSummary: summarizeSchedule(
              scheduleFor(context, compound.id),
            ),
            createdAt: compound.createdAt.toISOString(),
          })),
        }),
      };
    }

    return null;
  },
};

/**
 * D2 — a daily schedule with no dose time.
 *
 * Daily only. Weekly and biweekly projections anchor to the hour of the last
 * logged dose, which is defensible; a daily schedule with no time falls back to
 * a 9:00 AM default that is computed at projection time and never stored, so
 * the user is silently on an hour nobody chose.
 *
 * NO LONGER requires a logged dose (2026-08-11). That gate existed because
 * projectNextDoseAt returned null without one, so a time armed nothing and the
 * card was a no-op. The schedule anchor removed that premise: a stored time now
 * arms a reminder from the moment the schedule exists, so an active schedule is
 * reason enough to ask.
 */
export const missingDoseTime: Detector = {
  name: "missing-dose-time",
  detect(context): DetectorHit | null {
    for (const schedule of context.schedules) {
      if (schedule.frequency !== "daily") continue;
      if (schedule.timesOfDay.length > 0) continue;

      const compound = context.compounds.find(
        (candidate) => candidate.id === schedule.compoundId,
      );
      if (!compound) continue;

      return {
        subjectId: schedule.id,
        // Frequency rides along: a schedule that changes cadence is a new
        // question, even if the user waved off the old one.
        facts: [schedule.id, schedule.frequency],
        card: (key): DataHealthCard => ({
          detector: "missing-dose-time",
          key,
          scheduleId: schedule.id,
          compoundId: compound.id,
          compoundName: compound.name,
          frequency: schedule.frequency,
        }),
      };
    }

    return null;
  },
};

/**
 * D3 — a compound still called "Something else".
 *
 * Zero doses means onboarding tap-through noise rather than a medication anyone
 * takes, and stays silent.
 */
export const unidentifiedMedication: Detector = {
  name: "unidentified-medication",
  detect(context): DetectorHit | null {
    for (const compound of context.compounds) {
      if (normalizeCompoundName(compound.name) !== UNIDENTIFIED_COMPOUND_NAME) {
        continue;
      }
      const doseCount = liveDoseCount(context, compound.id);
      if (doseCount === 0) continue;

      return {
        subjectId: compound.id,
        facts: [compound.id],
        card: (key): DataHealthCard => ({
          detector: "unidentified-medication",
          key,
          compoundId: compound.id,
          doseCount,
        }),
      };
    }

    return null;
  },
};

/** Registry. ORDER IS PRIORITY — see the module comment for the rationale. */
export const DETECTORS: Detector[] = [
  duplicateCompounds,
  missingDoseTime,
  unidentifiedMedication,
];
