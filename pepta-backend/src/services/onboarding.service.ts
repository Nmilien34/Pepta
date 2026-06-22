import {
  onboardingResultResponseSchema,
  userProfileResponseSchema,
  type CompoundInput,
  type OnboardingCompleteInput,
  type ScheduleInput,
} from "@pepta/shared";
import { NotFoundError, ValidationError } from "../lib/errors";
import { computeProfileTargets } from "../lib/profile-targets";
import {
  CompoundModel,
  DoseLogModel,
  MedicationCatalogModel,
  ScheduleModel,
  UserModel,
  UserProfileModel,
  WeightLogModel,
} from "../models";
import { serializeWithSchema } from "./serializers";

function documentObject(document: unknown): Record<string, unknown> {
  if (document && typeof document === "object") {
    const maybeDocument = document as { toObject?: unknown };
    if (typeof maybeDocument.toObject === "function") {
      const value = maybeDocument.toObject();
      return value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    }
    return document as Record<string, unknown>;
  }

  return {};
}

function documentId(document: unknown): unknown {
  const value = documentObject(document);
  return value._id ?? value.id;
}

function isoToDate(value: string | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

function catalogString(
  catalog: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
): string {
  const value = catalog?.[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

async function loadCatalogDefaults(medicationCatalogId: string | undefined) {
  if (!medicationCatalogId) {
    return undefined;
  }

  const catalogDocument =
    await MedicationCatalogModel.findById(medicationCatalogId);
  if (!catalogDocument) {
    throw new NotFoundError("Medication catalog item not found");
  }

  return documentObject(catalogDocument);
}

function buildPlanHighlights(params: {
  medicationStatus: string;
  dailyProteinTargetGrams: number;
  dailyWaterTargetOz: number;
  dailyStepTarget: number;
}): string[] {
  const highlights = [
    `Protein target set to ${params.dailyProteinTargetGrams}g per day to protect lean mass.`,
    `Hydration target set to ${params.dailyWaterTargetOz} oz per day.`,
    `Step target set to ${params.dailyStepTarget.toLocaleString("en-US")} per day.`,
  ];

  if (params.medicationStatus === "active") {
    highlights.push(
      "Medication tracking is ready for the current dose schedule.",
    );
  } else if (params.medicationStatus === "starting_soon") {
    highlights.push(
      "Medication tracking can be added when the first dose starts.",
    );
  } else {
    highlights.push("Plan is set without active medication tracking.");
  }

  return highlights;
}

export async function completeOnboarding(
  userId: string,
  input: OnboardingCompleteInput,
) {
  const sideEffectBaseline =
    input.sideEffectBaseline ?? input.profile.sideEffectBaseline ?? [];
  const profileInput = {
    ...input.profile,
    medicationStatus: input.profile.medicationStatus ?? "none",
    sideEffectBaseline,
  };
  const targets = computeProfileTargets(profileInput);
  const profile = await UserProfileModel.findOneAndUpdate(
    { userId },
    {
      $set: {
        ...profileInput,
        ageYears: targets.ageYears,
        onboardingComplete: true,
        dailyCalorieTarget: targets.dailyCalorieTarget,
        dailyProteinTargetGrams: targets.dailyProteinTargetGrams,
        proteinGramsPerKg: targets.proteinGramsPerKg,
        targetWeeklyLossPercent: targets.targetWeeklyLossPercent,
        estimatedGoalDate: targets.estimatedGoalDate,
        dailyFiberTargetGrams: targets.dailyFiberTargetGrams,
        dailyWaterTargetOz: targets.dailyWaterTargetOz,
        dailyStepTarget: targets.dailyStepTarget,
        nutritionEngineVersion: targets.nutritionEngineVersion,
      },
    },
    { new: true, upsert: true, runValidators: true },
  );

  if (profileInput.medicationStatus === "active") {
    if (!input.compound) {
      throw new ValidationError(
        "Active medication onboarding requires a compound",
      );
    }

    const catalog = await loadCatalogDefaults(
      input.compound.medicationCatalogId,
    );
    const compoundInput: CompoundInput = {
      ...input.compound,
      route: (input.compound.route ??
        catalogString(catalog, "route", "injection")) as CompoundInput["route"],
      plannedDose:
        input.compound.plannedDose ??
        (typeof catalog?.defaultDose === "number"
          ? catalog.defaultDose
          : undefined),
    };
    const compound = await CompoundModel.findOneAndUpdate(
      {
        userId,
        name: compoundInput.name,
        startDate: compoundInput.startDate,
        deletedAt: null,
      },
      {
        $setOnInsert: {
          ...compoundInput,
          userId,
          deletedAt: null,
        },
      },
      { new: true, upsert: true, runValidators: true },
    );
    const compoundId = documentId(compound);
    if (!compoundId) {
      throw new ValidationError("Unable to create medication compound");
    }

    const scheduleInput = {
      frequency: (input.schedule?.frequency ??
        catalogString(
          catalog,
          "defaultFrequency",
          "weekly",
        )) as ScheduleInput["frequency"],
      intervalDays: input.schedule?.intervalDays,
      daysOfWeek: input.schedule?.daysOfWeek ?? [],
      nextDoseAt: input.schedule?.nextDoseAt,
      active: input.schedule?.active ?? true,
    };

    await ScheduleModel.findOneAndUpdate(
      {
        userId,
        compoundId,
        active: true,
      },
      {
        $setOnInsert: {
          ...scheduleInput,
          userId,
          compoundId,
          nextDoseAt: isoToDate(scheduleInput.nextDoseAt),
        },
      },
      { new: true, upsert: true, runValidators: true },
    );

    if (input.lastDose) {
      await DoseLogModel.findOneAndUpdate(
        {
          userId,
          compoundId,
          datetime: new Date(input.lastDose.datetime),
          deletedAt: null,
        },
        {
          $setOnInsert: {
            ...input.lastDose,
            userId,
            compoundId,
            datetime: new Date(input.lastDose.datetime),
            deletedAt: null,
          },
        },
        { new: true, upsert: true, runValidators: true },
      );
    }
  }

  const journeyStartAt = new Date(
    `${profileInput.journeyStartDate}T00:00:00.000Z`,
  );
  await WeightLogModel.findOneAndUpdate(
    {
      userId,
      datetime: journeyStartAt,
      deletedAt: null,
    },
    {
      $setOnInsert: {
        value: input.baselineWeight.value,
        unit: input.baselineWeight.unit,
        datetime: journeyStartAt,
        notes: input.baselineWeight.notes,
        userId,
        deletedAt: null,
      },
    },
    { new: true, upsert: true, runValidators: true },
  );

  await WeightLogModel.findOneAndUpdate(
    {
      userId,
      datetime: new Date(),
      deletedAt: null,
    },
    {
      $setOnInsert: {
        value: profileInput.currentWeight,
        unit: profileInput.weightUnit,
        datetime: new Date(),
        userId,
        deletedAt: null,
      },
    },
    { new: true, upsert: true, runValidators: true },
  );

  const userSet: Record<string, unknown> = {
    onboardingComplete: true,
    onboardingCompletedAt: new Date(),
  };
  if (input.legalAcceptance) {
    userSet.legalAcceptance = {
      ...input.legalAcceptance,
      acceptedAt: new Date(input.legalAcceptance.acceptedAt),
    };
  }

  await UserModel.findByIdAndUpdate(
    userId,
    {
      $set: userSet,
      $setOnInsert: {
        emailVerified: false,
        authProviders: [],
        entitlement: {
          status: "free",
          expiresAt: null,
          willRenew: false,
        },
      },
    },
    { new: true, upsert: true, runValidators: true },
  );

  const serializedProfile = serializeWithSchema(
    userProfileResponseSchema,
    profile,
  );

  return serializeWithSchema(onboardingResultResponseSchema, {
    profile: serializedProfile,
    lifestyleTargets: targets.lifestyleTargets,
    planHighlights: buildPlanHighlights({
      medicationStatus: profileInput.medicationStatus,
      dailyProteinTargetGrams: targets.dailyProteinTargetGrams,
      dailyWaterTargetOz: targets.dailyWaterTargetOz,
      dailyStepTarget: targets.dailyStepTarget,
    }),
  });
}
