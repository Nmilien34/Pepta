import type { DataHealthCard } from "@pepta/shared";
import { Types } from "mongoose";
import {
  CompoundModel,
  DoseLogModel,
  ScheduleModel,
} from "../../models";
import { listDismissedNudges } from "../user.service";
import { DETECTORS } from "./detectors";
import {
  firstUnresolvedCard,
  type DataHealthContext,
} from "./framework";

export * from "./framework";
export * from "./detectors";

/**
 * One load, shared by every detector. Detectors are pure functions over this —
 * they never query — so priority, dismissal and the interaction between
 * detectors are all testable without a database.
 */
export async function loadDataHealthContext(
  userId: string,
): Promise<DataHealthContext> {
  const [compounds, schedules, doseCounts] = await Promise.all([
    CompoundModel.find({ userId, status: "active", deletedAt: null }).sort({
      createdAt: 1,
    }),
    ScheduleModel.find({ userId, active: true }).sort({ updatedAt: -1 }),
    DoseLogModel.aggregate<{ _id: unknown; count: number }>([
      // aggregate() does not cast $match the way find() does — hence the
      // explicit ObjectId. A string here silently matches nothing.
      { $match: { userId: new Types.ObjectId(userId), deletedAt: null } },
      { $group: { _id: "$compoundId", count: { $sum: 1 } } },
    ]),
  ]);

  return {
    compounds: compounds.map((compound) => ({
      id: compound._id.toString(),
      name: compound.name,
      route: compound.route ?? null,
      plannedDose: compound.plannedDose ?? null,
      doseUnit: compound.doseUnit,
      createdAt: compound.createdAt,
      halfLifeDays: compound.halfLifeDays ?? null,
    })),
    schedules: schedules.map((schedule) => ({
      id: schedule._id.toString(),
      compoundId: schedule.compoundId.toString(),
      frequency: schedule.frequency,
      timesOfDay: schedule.timesOfDay ?? [],
      daysOfWeek: schedule.daysOfWeek ?? [],
    })),
    doseCounts: new Map(
      doseCounts.map((row) => [String(row._id), row.count] as const),
    ),
  };
}


export async function getDataHealthCard(
  userId: string,
): Promise<DataHealthCard | null> {
  const [context, dismissed] = await Promise.all([
    loadDataHealthContext(userId),
    listDismissedNudges(userId),
  ]);

  return firstUnresolvedCard(DETECTORS, context, dismissed);
}
