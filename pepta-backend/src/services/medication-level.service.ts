import { hasPattern, medicationLevelResponseSchema } from "@pepta/shared";
import {
  computeMedicationLevel,
  latestDose,
  projectNextDoseAt,
} from "../lib/pharmacokinetics";
import {
  CompoundModel,
  CycleModel,
  DoseLogModel,
  ScheduleModel,
  UserProfileModel,
} from "../models";

const MS_PER_HOUR = 60 * 60 * 1000;

/** Same frequency→interval mapping the level projection uses. */
function intervalDaysFor(schedule: { intervalDays?: number | null; frequency?: string } | null) {
  return (
    schedule?.intervalDays ??
    (schedule?.frequency === "weekly"
      ? 7
      : schedule?.frequency === "biweekly"
        ? 14
        : schedule?.frequency === "daily"
          ? 1
          : undefined)
  );
}

export interface NextDoseCandidate {
  compoundId: string;
  compoundName: string;
  nextDoseAt: string;
  hoursUntilNextDose: number;
}

/**
 * Next-dose timing for EVERY active compound, modelled or not.
 *
 * Scheduling is a property of the schedule, not of the pharmacokinetic model
 * (2026-08-11). This used to be a by-product of getMedicationLevels, which
 * skips compounds with no half-life — so a custom medication produced no
 * countdown and, because dose_due reads home.nextDose, no reminder either.
 * A compound with no curve still knows when its next dose is due.
 *
 * DECOUPLING, NOT RE-DERIVATION: this feeds projectNextDoseAt the exact
 * inputs computeMedicationLevel feeds it — same latest-dose selection, same
 * interval mapping, same cycle pattern, same profile timezone — so modelled
 * compounds must produce byte-identical values. A regression test pins that.
 */
export async function getNextDoseCandidates(
  userId: string,
  now = new Date(),
): Promise<NextDoseCandidate[]> {
  const [compounds, cycles, profile] = await Promise.all([
    CompoundModel.find({ userId, status: "active" }).sort({ createdAt: 1 }),
    CycleModel.find({ userId, active: true }).sort({ startDate: -1 }),
    UserProfileModel.findOne({ userId }).select({ timezone: 1 }),
  ]);

  const candidates = await Promise.all(
    compounds.map(async (compound) => {
      // NOTE: deliberately no halfLifeDays check — that is the whole fix.
      const [doseLogs, schedule] = await Promise.all([
        DoseLogModel.find({ userId, compoundId: compound._id }).sort({ datetime: 1 }),
        ScheduleModel.findOne({ userId, compoundId: compound._id, active: true }).sort({
          updatedAt: -1,
        }),
      ]);
      const intervalDays = intervalDaysFor(schedule);
      const cycle = cycles.find(
        (candidate) =>
          hasPattern(candidate) &&
          candidate.compoundIds.some((id) => id.toString() === compound._id.toString()),
      );

      const nextDoseAt = projectNextDoseAt({
        latest: latestDose(
          doseLogs.map((doseLog) => ({
            amount: doseLog.amount,
            datetime: doseLog.datetime.toISOString(),
          })),
        ),
        now,
        schedule: schedule
          ? {
              frequency: schedule.frequency,
              intervalDays,
              daysOfWeek: schedule.daysOfWeek,
              timesOfDay: schedule.timesOfDay,
            }
          : undefined,
        fallbackIntervalDays: intervalDays,
        // No dose logged yet → anchor on the schedule itself, so a brand-new
        // user's reminder arms from setup instead of waiting for a manual log.
        scheduleAnchor: schedule?.createdAt,
        timeZone: profile?.timezone ?? undefined,
        cyclePattern:
          cycle && hasPattern(cycle)
            ? {
                startDate: cycle.startDate,
                weeksOn: cycle.weeksOn,
                weeksOff: cycle.weeksOff,
                repeats: cycle.repeats ?? true,
              }
            : undefined,
      });
      if (nextDoseAt === null) return null;

      return {
        compoundId: compound._id.toString(),
        compoundName: compound.name,
        nextDoseAt: nextDoseAt.toISOString(),
        // Identical rounding to computeMedicationLevel's.
        hoursUntilNextDose: Math.max(
          0,
          Math.round((nextDoseAt.getTime() - now.getTime()) / MS_PER_HOUR),
        ),
      } satisfies NextDoseCandidate;
    }),
  );

  return candidates.filter((candidate) => candidate != null);
}

export async function getMedicationLevels(userId: string, now = new Date()) {
  const [compounds, cycles, profile] = await Promise.all([
    CompoundModel.find({ userId, status: "active" }).sort({ createdAt: 1 }),
    // Newest active pattern-bearing cycle wins — same rule as the app's
    // activeCycleOf, so the calendar band and this projection agree.
    CycleModel.find({ userId, active: true }).sort({ startDate: -1 }),
    // Protocol timesOfDay are user-local wall clock; the projection converts
    // them through the profile timezone.
    UserProfileModel.findOne({ userId }).select({ timezone: 1 }),
  ]);
  const levels = await Promise.all(
    compounds.map(async (compound) => {
      // Unmodelled compound (user skipped half-life): no curve, no next-dose
      // projection from levels — suppression, never a fabricated default.
      if (compound.halfLifeDays == null) return null;
      const [doseLogs, schedule] = await Promise.all([
        DoseLogModel.find({ userId, compoundId: compound._id }).sort({
          datetime: 1,
        }),
        ScheduleModel.findOne({
          userId,
          compoundId: compound._id,
          active: true,
        }).sort({
          updatedAt: -1,
        }),
      ]);
      const intervalDays =
        schedule?.intervalDays ??
        (schedule?.frequency === "weekly"
          ? 7
          : schedule?.frequency === "biweekly"
            ? 14
            : schedule?.frequency === "daily"
              ? 1
              : undefined);

      const cycle = cycles.find(
        (candidate) =>
          hasPattern(candidate) &&
          candidate.compoundIds.some(
            (id) => id.toString() === compound._id.toString(),
          ),
      );

      return medicationLevelResponseSchema.parse(
        computeMedicationLevel({
          compoundId: compound._id.toString(),
          compoundName: compound.name,
          halfLifeDays: compound.halfLifeDays,
          doses: doseLogs.map((doseLog) => ({
            amount: doseLog.amount,
            datetime: doseLog.datetime.toISOString(),
          })),
          now,
          scheduleIntervalDays: intervalDays,
          // Same anchor the candidate path uses — these two must not disagree.
          scheduleAnchor: schedule?.createdAt,
          schedule: schedule
            ? {
                frequency: schedule.frequency,
                intervalDays,
                daysOfWeek: schedule.daysOfWeek,
                timesOfDay: schedule.timesOfDay,
              }
            : undefined,
          timeZone: profile?.timezone ?? undefined,
          cyclePattern:
            cycle && hasPattern(cycle)
              ? {
                  startDate: cycle.startDate,
                  weeksOn: cycle.weeksOn,
                  weeksOff: cycle.weeksOff,
                  repeats: cycle.repeats ?? true,
                }
              : undefined,
        }),
      );
    }),
  );

  return levels.filter((level) => level != null);
}
