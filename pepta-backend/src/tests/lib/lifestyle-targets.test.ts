import { describe, expect, it } from "vitest";
import { computeLifestyleTargets } from "../../lib/lifestyle-targets";

describe("lifestyle targets", () => {
  it("raises hydration and fiber targets for GI side effects", () => {
    const result = computeLifestyleTargets({
      currentWeightLb: 180,
      activityLevel: "light",
      sideEffectBaseline: ["constipation", "nausea"],
    });

    expect(result.dailyWaterTargetOz).toBe(106);
    expect(result.dailyFiberTargetGrams).toBe(38);
    expect(result.dailyStepTarget).toBe(7000);
    expect(result.adjustedFor).toEqual(["nausea", "constipation"]);
  });

  it("reduces step targets when fatigue is present without going below the floor", () => {
    const result = computeLifestyleTargets({
      currentWeightLb: 110,
      activityLevel: "sedentary",
      sideEffectBaseline: ["fatigue"],
    });

    expect(result.dailyWaterTargetOz).toBe(64);
    expect(result.dailyFiberTargetGrams).toBe(30);
    expect(result.dailyStepTarget).toBe(3500);
    expect(result.adjustedFor).toEqual(["fatigue"]);
  });
});
