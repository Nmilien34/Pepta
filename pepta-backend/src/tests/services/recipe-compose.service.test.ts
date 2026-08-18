import { describe, expect, it } from "vitest";
import { parseRecipeComposeJson } from "../../services/recipe-compose.service";

const good = JSON.stringify({
  name: "Overnight oats + whey",
  ingredients: [
    { name: "Rolled oats", amount: "1/2 cup dry", protein: 5, calories: 150, fiber: 4 },
    { name: "Milk", amount: "1 cup", protein: 8, calories: 103 },
    { name: "Whey protein", amount: "1 scoop", protein: 24, calories: 120 },
  ],
  confidence: 0.8,
});

describe("parseRecipeComposeJson", () => {
  it("returns the PARTS, which is the whole point of composing", () => {
    const out = parseRecipeComposeJson(good, "");
    expect(out.name).toBe("Overnight oats + whey");
    expect(out.ingredients).toHaveLength(3);
    expect(out.ingredients[0]).toMatchObject({
      name: "Rolled oats",
      amount: "1/2 cup dry",
      protein: 5,
      calories: 150,
      fiber: 4,
    });
  });

  it("drops one unusable row rather than costing the user the recipe", () => {
    const partly = JSON.stringify({
      name: "Shake",
      ingredients: [
        { name: "Whey", amount: "1 scoop", protein: 24, calories: 120 },
        { name: "", protein: 1, calories: 1 },
        { name: "Milk", protein: "lots", calories: 103 },
        { name: "Banana", amount: "1", protein: 1, calories: 105 },
      ],
      confidence: 0.6,
    });
    const out = parseRecipeComposeJson(partly, "");
    expect(out.ingredients.map((i) => i.name)).toEqual(["Whey", "Banana"]);
  });

  it("throws only when nothing usable came back", () => {
    expect(() => parseRecipeComposeJson(JSON.stringify({ name: "X", ingredients: [] }), "")).toThrow(
      /no usable ingredients/i,
    );
  });

  it("clamps figures a model can hallucinate", () => {
    const wild = JSON.stringify({
      name: "X",
      ingredients: [{ name: "Y", amount: "1", protein: 99999, calories: -5, fiber: 5000 }],
      confidence: 4,
    });
    const out = parseRecipeComposeJson(wild, "");
    expect(out.ingredients[0]!.protein).toBe(300);
    expect(out.ingredients[0]!.calories).toBe(0);
    expect(out.ingredients[0]!.fiber).toBe(100);
    expect(out.confidence).toBe(1);
  });

  it("treats a missing confidence as middling, not as certainty", () => {
    const noConf = JSON.stringify({
      name: "X",
      ingredients: [{ name: "Y", amount: "1", protein: 10, calories: 100 }],
    });
    expect(parseRecipeComposeJson(noConf, "").confidence).toBe(0.5);
  });

  it("falls back to the name the user gave, then to something sane", () => {
    const unnamed = JSON.stringify({
      ingredients: [{ name: "Y", amount: "1", protein: 10, calories: 100 }],
    });
    expect(parseRecipeComposeJson(unnamed, "My breakfast").name).toBe("My breakfast");
    expect(parseRecipeComposeJson(unnamed, "").name).toBe("New recipe");
  });

  it("omits fiber it was not told, rather than writing a zero", () => {
    const out = parseRecipeComposeJson(good, "");
    expect(out.ingredients[1]).not.toHaveProperty("fiber");
  });

  it("caps a runaway ingredient list", () => {
    const many = JSON.stringify({
      name: "X",
      ingredients: Array.from({ length: 50 }, (_, i) => ({
        name: `Item ${i}`,
        amount: "1",
        protein: 1,
        calories: 10,
      })),
      confidence: 0.5,
    });
    expect(parseRecipeComposeJson(many, "").ingredients).toHaveLength(20);
  });

  it("rejects malformed JSON loudly rather than half-saving", () => {
    expect(() => parseRecipeComposeJson("{not json", "")).toThrow();
  });
});
