import {
  compoundResponseSchema,
  cycleResponseSchema,
  medicationCatalogItemSchema,
  researchArticleSchema,
  scheduleResponseSchema,
  type CompoundInput,
  type CompoundPatch,
  type CycleInput,
  type SchedulePatch,
  type ScheduleInput,
} from "@pepta/shared";
import {
  CompoundModel,
  CycleModel,
  MedicationCatalogModel,
  ResearchArticleModel,
  ScheduleModel,
} from "../models";
import { NotFoundError } from "../lib/errors";
import { serializeWithSchema } from "./serializers";

function omitUndefined(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).filter((entry) => entry[1] !== undefined),
  );
}

export async function listMedicationCatalog() {
  const items = await MedicationCatalogModel.find({ active: true }).sort({
    name: 1,
  });
  return items.map((item) =>
    serializeWithSchema(medicationCatalogItemSchema, item),
  );
}

export async function listResearchArticles() {
  const articles = await ResearchArticleModel.find({}).sort({
    publishedAt: -1,
    title: 1,
  });
  return articles.map((article) =>
    serializeWithSchema(researchArticleSchema, article),
  );
}

export async function listCompounds(userId: string) {
  const compounds = await CompoundModel.find({ userId }).sort({
    createdAt: -1,
  });
  return compounds.map((compound) =>
    serializeWithSchema(compoundResponseSchema, compound),
  );
}

export async function createCompound(userId: string, input: CompoundInput) {
  const compound = await CompoundModel.create({
    ...input,
    userId,
    deletedAt: null,
  });

  return serializeWithSchema(compoundResponseSchema, compound);
}

export async function deleteCompound(userId: string, id: string) {
  const compound = await CompoundModel.findOneAndUpdate(
    { _id: id, userId },
    { $set: { deletedAt: new Date(), status: "completed" } },
    { new: true, runValidators: true },
  );

  if (!compound) {
    throw new NotFoundError("Compound not found");
  }

  return serializeWithSchema(compoundResponseSchema, compound);
}

export async function updateCompound(
  userId: string,
  id: string,
  input: CompoundPatch,
) {
  const compound = await CompoundModel.findOneAndUpdate(
    { _id: id, userId, deletedAt: null },
    { $set: omitUndefined(input) },
    { new: true, runValidators: true },
  );

  if (!compound) {
    throw new NotFoundError("Compound not found");
  }

  return serializeWithSchema(compoundResponseSchema, compound);
}

export async function listSchedules(userId: string) {
  const schedules = await ScheduleModel.find({ userId }).sort({
    createdAt: -1,
  });
  return schedules.map((schedule) =>
    serializeWithSchema(scheduleResponseSchema, schedule),
  );
}

export async function createSchedule(userId: string, input: ScheduleInput) {
  const schedule = await ScheduleModel.create({
    ...input,
    userId,
    nextDoseAt: input.nextDoseAt ? new Date(input.nextDoseAt) : undefined,
  });

  return serializeWithSchema(scheduleResponseSchema, schedule);
}

export async function deleteSchedule(userId: string, id: string) {
  const schedule = await ScheduleModel.findOneAndUpdate(
    { _id: id, userId },
    { $set: { active: false } },
    { new: true, runValidators: true },
  );

  if (!schedule) {
    throw new NotFoundError("Schedule not found");
  }

  return serializeWithSchema(scheduleResponseSchema, schedule);
}

export async function updateSchedule(
  userId: string,
  id: string,
  input: SchedulePatch,
) {
  const schedule = await ScheduleModel.findOneAndUpdate(
    { _id: id, userId },
    {
      $set: omitUndefined({
        ...input,
        nextDoseAt: input.nextDoseAt ? new Date(input.nextDoseAt) : undefined,
      }),
    },
    { new: true, runValidators: true },
  );

  if (!schedule) {
    throw new NotFoundError("Schedule not found");
  }

  return serializeWithSchema(scheduleResponseSchema, schedule);
}

export async function listCycles(userId: string) {
  const cycles = await CycleModel.find({ userId }).sort({ startDate: -1 });
  return cycles.map((cycle) => serializeWithSchema(cycleResponseSchema, cycle));
}

export async function createCycle(userId: string, input: CycleInput) {
  const cycle = await CycleModel.create({
    ...input,
    userId,
    active: true,
  });

  return serializeWithSchema(cycleResponseSchema, cycle);
}

export async function deleteCycle(userId: string, id: string) {
  const cycle = await CycleModel.findOneAndUpdate(
    { _id: id, userId },
    { $set: { active: false } },
    { new: true, runValidators: true },
  );

  if (!cycle) {
    throw new NotFoundError("Cycle not found");
  }

  return serializeWithSchema(cycleResponseSchema, cycle);
}
