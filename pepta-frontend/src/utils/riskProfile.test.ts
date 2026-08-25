// The risk profile.
//
// This number is shown to someone at the emotional peak of onboarding, next to
// a button that costs money. So the tests are less about arithmetic than about
// the two ways a score like this goes wrong: telling everyone they are fine,
// or telling everyone they are doomed. Both make it noise.

import { describe, expect, it } from "vitest";
import { buildRiskProfile, topDriver, RISK_DRIVERS, type RiskInput } from "./riskProfile";

/** Someone doing everything right. */
const CAREFUL: RiskInput = {
  weeklyLoss: 0.8,
  weight: 220,        // 0.36%/week
  trainingStatus: "consistent",
  activityLevel: "moderate",
  ageYears: 29,
};

/** Someone doing none of it. */
const EXPOSED: RiskInput = {
  weeklyLoss: 2.8,
  weight: 220,        // 1.27%/week
  trainingStatus: "not_training",
  activityLevel: "sedentary",
  ageYears: 58,
};

describe("the score separates people who are actually different", () => {
  it("reads low for the careful and high for the exposed", () => {
    // A score that cannot tell these two apart is decoration.
    expect(buildRiskProfile(CAREFUL).score).toBeLessThan(35);
    expect(buildRiskProfile(EXPOSED).score).toBeGreaterThan(75);
  });

  it("stays inside 0–100 for absurd input", () => {
    for (const weeklyLoss of [0, 40, -5]) {
      const { score } = buildRiskProfile({ ...EXPOSED, weeklyLoss });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

describe("the drivers have to spread", () => {
  it("gives a mixed profile a real range, not four numbers in a huddle", () => {
    // THE failure mode. Everything at 80 reads as generated and gets ignored;
    // a driver sitting genuinely low is what makes the high one believable.
    const scores = buildRiskProfile({
      weeklyLoss: 2.4,
      weight: 220,
      trainingStatus: "not_training",
      activityLevel: "light",
      ageYears: 31,
    }).drivers.map((d) => d.score);

    expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThan(40);
  });

  it("lets a 29-year-old's age look like the non-problem it is", () => {
    const age = buildRiskProfile(CAREFUL).drivers.find((d) => d.key === "age")!;

    expect(age.score).toBeLessThan(25);
  });

  it("names every driver after something the user chose or can change", () => {
    // Never a body part, never a diagnosis — each label has to point at an
    // action, or the screen is a verdict rather than a plan.
    for (const d of buildRiskProfile(EXPOSED).drivers) {
      expect(d.label).toMatch(/^[A-Z]/);
      expect(d.label.length).toBeLessThanOrEqual(22);
    }
    expect(buildRiskProfile(EXPOSED).drivers.map((d) => d.key)).toEqual([...RISK_DRIVERS]);
  });
});

describe("each driver actually responds to its own input", () => {
  it("rises with the pace they picked", () => {
    const slow = buildRiskProfile({ ...CAREFUL, weeklyLoss: 0.8 });
    const fast = buildRiskProfile({ ...CAREFUL, weeklyLoss: 2.6 });

    expect(fast.score).toBeGreaterThan(slow.score);
  });

  it("falls when they lift", () => {
    const none = buildRiskProfile({ ...EXPOSED, trainingStatus: "not_training" });
    const lifting = buildRiskProfile({ ...EXPOSED, trainingStatus: "consistent" });

    expect(lifting.score).toBeLessThan(none.score);
  });

  it("weights pace above everything else", () => {
    // Rate of loss is both the best-evidenced driver and the one they just
    // set on a slider, so it should move the total more than the others.
    const base: RiskInput = { ...CAREFUL };
    const pacier = buildRiskProfile({ ...base, weeklyLoss: 2.6 }).score - buildRiskProfile(base).score;
    const older = buildRiskProfile({ ...base, ageYears: 60 }).score - buildRiskProfile(base).score;

    expect(pacier).toBeGreaterThan(older);
  });
});

describe("missing answers do not read as good news", () => {
  it("lands mid-scale when it knows nothing, rather than at zero", () => {
    // A user who skipped everything must not be told they are low risk.
    const blank = buildRiskProfile({});

    expect(blank.score).toBeGreaterThan(35);
    expect(blank.score).toBeLessThan(65);
  });

  it("survives a weight of zero without dividing by it", () => {
    expect(() => buildRiskProfile({ weeklyLoss: 1, weight: 0 })).not.toThrow();
    expect(Number.isFinite(buildRiskProfile({ weeklyLoss: 1, weight: 0 }).score)).toBe(true);
  });
});

describe("activity risk falls as the user moves more", () => {
  it("orders the four tiers correctly", () => {
    // The union is NOT ordered how it reads: `active` is the top tier and
    // `moderate` is the middle one. An inverted table would tell the most
    // active users they are the most at risk, and nothing else would notice.
    const riskOf = (activityLevel: RiskInput["activityLevel"]) =>
      buildRiskProfile({ activityLevel }).drivers.find((d) => d.key === "activity")!.score;

    expect(riskOf("sedentary")).toBeGreaterThan(riskOf("light"));
    expect(riskOf("light")).toBeGreaterThan(riskOf("moderate"));
    expect(riskOf("moderate")).toBeGreaterThan(riskOf("active"));
  });

  it("covers every level the screen can produce", () => {
    // No level may fall through to the unknown-answer default — and the
    // default is chosen so that "unanswered" is distinguishable from every
    // real tier, which is what makes this assertion possible at all.
    const unknown = buildRiskProfile({}).drivers.find((d) => d.key === "activity")!.score;

    for (const level of ["sedentary", "light", "moderate", "active"] as const) {
      expect(buildRiskProfile({ activityLevel: level }).drivers.find((d) => d.key === "activity")!.score)
        .not.toBe(unknown);
    }
  });
});

describe("topDriver", () => {
  it("returns the worst one, which is also the most improvable", () => {
    // At 1.27%/week pace clamps to 100 and outranks not-training at 92 — which
    // is the correct advice: slowing down moves more than starting to lift.
    expect(topDriver(buildRiskProfile(EXPOSED)).key).toBe("pace");
  });

  it("switches to training once the pace is already sane", () => {
    const gentleButIdle = buildRiskProfile({ ...EXPOSED, weeklyLoss: 0.9 });

    expect(topDriver(gentleButIdle).key).toBe("training");
  });
});
