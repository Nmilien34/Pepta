/**
 * Merge duplicate compounds into one.
 *
 * NEVER runs on its own. The user picks the keeper in the chooser, having been
 * shown how the records differ, because two records with different doses are as
 * likely to be a titration step as a retry — a silent merge would quietly
 * rewrite someone's dose history on a guess.
 *
 * KEEPER'S SETTINGS WIN. Dose logs move to the keeper; the losers' schedules
 * are deactivated rather than repointed. Repointing them would leave one
 * compound holding two active daily schedules at different hours, which
 * projectNextDoseAt reads as split dosing — the user would get two reminders a
 * day for a once-daily pill. Picking a compound in the chooser is knowingly
 * picking its schedule.
 *
 * TRANSACTIONAL: dose logs, schedules, cycles and the compounds themselves move
 * together or not at all. A half-applied merge would strand dose history on a
 * deleted compound, which is exactly the corruption this feature exists to fix.
 *
 * IDEMPOTENT: ids that are already merged are skipped, and a call with nothing
 * left to do succeeds without writing. Retrying a request whose response was
 * lost is safe.
 */

import mongoose from "mongoose";
import { compoundResponseSchema } from "@pepta/shared";
import { NotFoundError, ValidationError } from "../lib/errors";
import {
  CompoundModel,
  CycleModel,
  DoseLogModel,
  ScheduleModel,
} from "../models";
import { serializeWithSchema } from "./serializers";

export interface MergeCompoundsResult {
  compound: unknown;
  /** Ids actually merged by THIS call — empty when it was a replayed no-op. */
  mergedCompoundIds: string[];
  movedDoseLogs: number;
  deactivatedSchedules: number;
}

export async function mergeCompounds(
  userId: string,
  keepCompoundId: string,
  mergeCompoundIds: string[],
): Promise<MergeCompoundsResult> {
  if (mergeCompoundIds.includes(keepCompoundId)) {
    throw new ValidationError("Cannot merge a compound into itself");
  }

  const keeper = await CompoundModel.findOne({
    _id: keepCompoundId,
    userId,
    deletedAt: null,
  });
  if (!keeper) {
    throw new NotFoundError("Compound not found");
  }

  // Only ids that are still live belong to this call. Anything already merged
  // is skipped rather than rejected — that is what makes a retry safe.
  const losers = await CompoundModel.find({
    _id: { $in: mergeCompoundIds },
    userId,
    deletedAt: null,
  });
  const loserIds = losers.map((compound) => compound._id);

  if (loserIds.length === 0) {
    return {
      compound: serializeWithSchema(compoundResponseSchema, keeper),
      mergedCompoundIds: [],
      movedDoseLogs: 0,
      deactivatedSchedules: 0,
    };
  }

  let movedDoseLogs = 0;
  let deactivatedSchedules = 0;
  const now = new Date();

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      movedDoseLogs = 0;
      deactivatedSchedules = 0;

      const doseResult = await DoseLogModel.updateMany(
        { userId, compoundId: { $in: loserIds } },
        { $set: { compoundId: keeper._id } },
        { session },
      );
      movedDoseLogs = doseResult.modifiedCount ?? 0;

      const scheduleResult = await ScheduleModel.updateMany(
        { userId, compoundId: { $in: loserIds } },
        { $set: { active: false } },
        { session },
      );
      deactivatedSchedules = scheduleResult.modifiedCount ?? 0;

      // compoundIds is an array, so a loser has to be swapped for the keeper
      // without duplicating it when the cycle already covers both.
      const cycles = await CycleModel.find({
        userId,
        compoundIds: { $in: loserIds },
      }).session(session);
      for (const cycle of cycles) {
        const kept = cycle.compoundIds.filter(
          (id) => !loserIds.some((loserId) => loserId.equals(id)),
        );
        if (!kept.some((id) => id.equals(keeper._id))) {
          kept.push(keeper._id);
        }
        cycle.compoundIds = kept;
        await cycle.save({ session });
      }

      await CompoundModel.updateMany(
        { _id: { $in: loserIds }, userId },
        { $set: { deletedAt: now, status: "completed" } },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  const merged = await CompoundModel.findById(keeper._id);

  return {
    compound: serializeWithSchema(compoundResponseSchema, merged ?? keeper),
    mergedCompoundIds: loserIds.map((id) => id.toString()),
    movedDoseLogs,
    deactivatedSchedules,
  };
}
