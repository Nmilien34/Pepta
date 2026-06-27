/**
 * Seed the App Store review demo account (guideline 2.1a) with weeks of realistic
 * data so a reviewer can verify every feature: medication level, dose history,
 * injection-site map, weight trend, macros, meals, measurements. Idempotent —
 * re-running wipes the demo account's logs and recreates them. The reviewer signs
 * in via POST /auth/demo (see signInWithReviewAccount) with the credentials in
 * src/config/demoAccount.
 *
 * Loads .env directly (does NOT import ../config/env, which fail-fasts on the full
 * required production set), like check-integrations.
 *
 * Run from pepta-backend/:   npm run seed:demo
 * or from repo root:         npx tsx pepta-backend/src/scripts/seedDemoUser.ts
 * On Render: open the pepta-backend Shell and run the npx form.
 */
import path from "node:path";
import dotenv from "dotenv";
import mongoose from "mongoose";

const repoRoot = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env"), override: true });
dotenv.config({ override: false });

import { DEMO_ACCOUNT } from "../config/demoAccount";
import { completeOnboarding } from "../services/onboarding.service";
import {
  CompoundModel,
  DoseLogModel,
  FiberLogModel,
  MealLogModel,
  MeasurementModel,
  ProteinLogModel,
  SideEffectLogModel,
  UserModel,
  WaterLogModel,
  WeightLogModel,
} from "../models";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const daysAgo = (n: number): Date => new Date(now.getTime() - n * DAY);
const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const round1 = (n: number): number => Math.round(n * 10) / 10;

const START_WEIGHT = 213;
const CURRENT_WEIGHT = 196;
const GOAL_WEIGHT = 175;
const WEEKS = 10; // weeks of history
const SITES = [
  "abdomen_left",
  "thigh_right",
  "arm_left",
  "abdomen_right",
] as const;

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    console.error(
      "MONGODB_URI is not set. Run from the Render shell or set it in .env.",
    );
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  });

  try {
    // 1) User — onboarded, with an active entitlement so premium features unlock.
    const user = await UserModel.findOneAndUpdate(
      { email: DEMO_ACCOUNT.email },
      {
        $set: {
          email: DEMO_ACCOUNT.email,
          emailVerified: true,
          displayName: DEMO_ACCOUNT.displayName,
          onboardingComplete: true,
          onboardingCompletedAt: daysAgo(WEEKS * 7),
          entitlement: {
            status: "active",
            expiresAt: new Date(now.getTime() + 365 * DAY),
            willRenew: true,
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const userId = user._id;
    const userIdStr = userId.toString();

    // 2) Profile + compound + schedule + first dose, via the real onboarding path
    //    (computes all derived targets — calories, protein, fiber, water, steps).
    await completeOnboarding(userIdStr, {
      profile: {
        sex: "male",
        ageYears: 38,
        genderIdentity: "man",
        medicationStatus: "active",
        height: 70,
        heightUnit: "in",
        currentWeight: CURRENT_WEIGHT,
        weightUnit: "lb",
        goalWeight: GOAL_WEIGHT,
        goalWeightUnit: "lb",
        goalPace: "steady",
        activityLevel: "light",
        trainingStatus: "returning",
        goalType: "lose_fat",
        biggestWorry: "losing_muscle",
        doseUnitPreference: "mg",
        onboardingComplete: true,
        journeyStartDate: ymd(daysAgo(WEEKS * 7)),
        timezone: "America/New_York",
        sideEffectBaseline: ["nausea"],
      },
      compound: {
        name: "Tirzepatide",
        drugClass: "dual_glp_1_gip",
        route: "injection",
        halfLifeDays: 5,
        doseUnit: "mg",
        plannedDose: 5,
        startDate: ymd(daysAgo(WEEKS * 7)),
        status: "active",
      },
      schedule: { frequency: "weekly", daysOfWeek: [0], active: true },
      lastDose: {
        amount: 5,
        unit: "mg",
        injectionSite: "abdomen_left",
        datetime: daysAgo(2).toISOString(),
      },
      baselineWeight: {
        value: START_WEIGHT,
        unit: "lb",
        datetime: daysAgo(WEEKS * 7).toISOString(),
      },
      sideEffectBaseline: ["nausea"],
    });

    const compound = await CompoundModel.findOne({ userId, deletedAt: null });
    if (!compound) throw new Error("compound was not created by onboarding");
    const compoundId = compound._id;

    // 3) Weekly weigh-ins trending START_WEIGHT -> CURRENT_WEIGHT.
    await WeightLogModel.deleteMany({ userId });
    const step = (START_WEIGHT - CURRENT_WEIGHT) / WEEKS;
    await WeightLogModel.insertMany(
      Array.from({ length: WEEKS + 1 }, (_, i) => {
        const w = WEEKS - i; // weeks ago
        return {
          userId,
          value: round1(CURRENT_WEIGHT + w * step),
          unit: "lb",
          datetime: daysAgo(w * 7),
          deletedAt: null,
        };
      }),
    );

    // 4) Weekly doses (rotating sites) for the full history — drives the dose
    //    history list, the injection-site map, and the medication-level curve.
    await DoseLogModel.deleteMany({ userId });
    await DoseLogModel.insertMany(
      Array.from({ length: WEEKS }, (_, i) => {
        const w = i + 1; // 1..WEEKS weeks ago (the last dose was 2 days ago via onboarding)
        return {
          userId,
          compoundId,
          amount: 5,
          unit: "mg",
          injectionSite: SITES[i % SITES.length],
          datetime: daysAgo(w * 7 + 2),
          deletedAt: null,
        };
      }),
    );

    // 5) Today's nutrition — meals + water + protein + fiber.
    await MealLogModel.deleteMany({ userId });
    await MealLogModel.insertMany([
      {
        userId,
        foodName: "Greek yogurt with berries",
        servingSize: "1 bowl",
        protein: 22,
        calories: 210,
        carbs: 24,
        fat: 4,
        fiber: 3,
        source: "scan",
        datetime: daysAgo(0),
        deletedAt: null,
      },
      {
        userId,
        foodName: "Grilled chicken & rice",
        servingSize: "1 plate",
        protein: 48,
        calories: 540,
        carbs: 48,
        fat: 14,
        fiber: 3,
        source: "scan",
        datetime: daysAgo(0),
        deletedAt: null,
      },
      {
        userId,
        foodName: "Protein shake",
        servingSize: "1 scoop",
        protein: 30,
        calories: 180,
        carbs: 6,
        fat: 3,
        fiber: 1,
        source: "manual",
        datetime: daysAgo(0),
        deletedAt: null,
      },
      {
        userId,
        foodName: "Salmon with vegetables",
        servingSize: "1 plate",
        protein: 40,
        calories: 480,
        carbs: 20,
        fat: 24,
        fiber: 6,
        source: "voice",
        datetime: daysAgo(1),
        deletedAt: null,
      },
    ]);

    await WaterLogModel.deleteMany({ userId });
    await WaterLogModel.insertMany(
      [8, 8, 16, 12].map((amountOz, i) => ({
        userId,
        amountOz,
        datetime: daysAgo(0 + i * 0),
        deletedAt: null,
      })),
    );

    await ProteinLogModel.deleteMany({ userId });
    await ProteinLogModel.insertMany([
      { userId, grams: 20, datetime: daysAgo(0), deletedAt: null },
    ]);

    await FiberLogModel.deleteMany({ userId });
    await FiberLogModel.insertMany([
      { userId, grams: 5, datetime: daysAgo(0), deletedAt: null },
    ]);

    // 6) Body measurements (a couple of points so Progress shows them).
    await MeasurementModel.deleteMany({ userId });
    await MeasurementModel.insertMany([
      {
        userId,
        type: "waist",
        value: 36,
        unit: "in",
        datetime: daysAgo(WEEKS * 7),
        deletedAt: null,
      },
      {
        userId,
        type: "waist",
        value: 33,
        unit: "in",
        datetime: daysAgo(0),
        deletedAt: null,
      },
      {
        userId,
        type: "hips",
        value: 41,
        unit: "in",
        datetime: daysAgo(0),
        deletedAt: null,
      },
    ]);

    // 7) An early, mild side effect (resolved) so the Track side-effects card has data.
    await SideEffectLogModel.deleteMany({ userId });
    await SideEffectLogModel.insertMany([
      {
        userId,
        types: ["nausea"],
        severity: 2,
        datetime: daysAgo(WEEKS * 7 - 3),
        notes: "Mild the first few days, eased off.",
        deletedAt: null,
      },
    ]);

    console.log("Demo account seeded:");
    console.log(`  email:    ${DEMO_ACCOUNT.email}`);
    console.log(`  password: ${DEMO_ACCOUNT.password}`);
    console.log(`  _id:      ${userIdStr}`);
    console.log(
      `  data:     profile + Tirzepatide compound, ${WEEKS + 1} weigh-ins, ${WEEKS} doses, 4 meals, water/protein/fiber, 3 measurements, 1 side effect`,
    );
    console.log(
      "\nThe app's 'Reviewer sign-in' calls POST /auth/demo with these credentials.",
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("seed:demo failed:", error);
  process.exitCode = 1;
  void mongoose.disconnect();
});
