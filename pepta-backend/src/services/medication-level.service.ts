import { hasPattern, medicationLevelResponseSchema } from "@pepta/shared";
import { computeMedicationLevel } from "../lib/pharmacokinetics";
import {
  CompoundModel,
  CycleModel,
  DoseLogModel,
  ScheduleModel,
  UserProfileModel,
} from "../models";

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
