import { medicationLevelResponseSchema } from "@pepta/shared";
import { computeMedicationLevel } from "../lib/pharmacokinetics";
import { CompoundModel, DoseLogModel, ScheduleModel } from "../models";

export async function getMedicationLevels(userId: string, now = new Date()) {
  const compounds = await CompoundModel.find({ userId, status: "active" }).sort(
    { createdAt: 1 },
  );
  const levels = await Promise.all(
    compounds.map(async (compound) => {
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
            : undefined);

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
              }
            : undefined,
        }),
      );
    }),
  );

  return levels;
}
