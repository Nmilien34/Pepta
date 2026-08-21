// The photo path's parser. A meal photo is the app's flagship way to log
// food, and whatever this returns is what the app posts to /meal-logs — whose
// schema only asks for nonnegative numbers. So this is the last place an
// implausible estimate can be caught before it becomes the user's day total,
// their Progress chart, and the context Pep answers from.

import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/env", () => ({
  env: { openai: { apiKey: undefined } },
}));

import { parseMealScanVisionJson } from "../../services/meal-scan-vision.service";

const valid = {
  foodName: "Chicken and rice",
  servingSize: "1 bowl",
  protein: 45,
  calories: 550,
  carbs: 64,
  fat: 12,
  fiber: 3,
  confidence: 0.8,
};

describe("parseMealScanVisionJson", () => {
  it("passes a plausible estimate through untouched", () => {
    expect(parseMealScanVisionJson(JSON.stringify(valid))).toEqual(valid);
  });

  it("clamps a hallucinated estimate to the plausibility band", () => {
    const parsed = parseMealScanVisionJson(
      JSON.stringify({
        ...valid,
        protein: 999_999,
        calories: 1e9,
        carbs: 40_000,
        fat: 8_000,
        fiber: 5_000,
      }),
    );

    expect(parsed).toMatchObject({
      protein: 300,
      calories: 3000,
      carbs: 500,
      fat: 250,
      fiber: 100,
    });
  });

  it("does not turn a large-but-real meal into a smaller one", () => {
    const parsed = parseMealScanVisionJson(
      JSON.stringify({ ...valid, protein: 120, calories: 2400 }),
    );

    // The bounds are a per-meal ceiling, not an opinion about big plates.
    expect(parsed.protein).toBe(120);
    expect(parsed.calories).toBe(2400);
  });

  it("rejects non-finite numbers instead of clamping them to a bound", () => {
    // Math.min/max would carry NaN straight through, so finiteness is checked
    // before the clamp ever runs.
    expect(() =>
      parseMealScanVisionJson(JSON.stringify({ ...valid, protein: "NaN" })),
    ).toThrow();
    expect(() =>
      parseMealScanVisionJson('{"foodName":"x","servingSize":"1","protein":1e999,"calories":10,"carbs":1,"fat":1,"fiber":1,"confidence":0.5}'),
    ).toThrow();
  });

  it("rejects a negative macro rather than flooring it to zero", () => {
    expect(() =>
      parseMealScanVisionJson(JSON.stringify({ ...valid, calories: -50 })),
    ).toThrow();
  });

  it("rejects a response missing the fields the app depends on", () => {
    expect(() => parseMealScanVisionJson('{"foodName":"Toast"}')).toThrow();
    expect(() => parseMealScanVisionJson("not json at all")).toThrow();
  });
});
