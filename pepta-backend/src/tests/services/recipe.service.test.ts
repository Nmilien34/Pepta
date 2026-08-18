import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  create: vi.fn(),
  deleteOne: vi.fn(),
}));

vi.mock("../../models/recipe.model", () => ({
  RecipeModel: { find: mocks.find, create: mocks.create, deleteOne: mocks.deleteOne },
}));

import { createRecipe, deleteRecipe, listRecipes } from "../../services/recipe.service";
import { STARTER_RECIPES } from "../../seeds/starter-recipes.seed";

const USER = "507f1f77bcf86cd799439011";

function doc(over: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => "r1" },
    userId: { toString: () => USER },
    name: "Morning shake",
    ingredients: [
      { name: "Whey", amount: "1 scoop", protein: 24, calories: 120 },
      { name: "Milk", amount: "1 cup", protein: 8, calories: 103 },
    ],
    createdAt: new Date("2026-08-17T12:00:00.000Z"),
    updatedAt: new Date("2026-08-17T12:00:00.000Z"),
    ...over,
  };
}

beforeEach(() => {
  mocks.find.mockReset();
  mocks.create.mockReset();
  mocks.deleteOne.mockReset();
});

describe("listRecipes", () => {
  it("returns the user's and the starters separately", async () => {
    mocks.find
      .mockReturnValueOnce({ sort: () => ({ exec: vi.fn().mockResolvedValue([doc()]) }) })
      .mockReturnValueOnce({
        sort: () => ({ exec: vi.fn().mockResolvedValue([doc({ userId: null, name: "Tuna salad" })]) }),
      });

    const out = await listRecipes(USER);

    expect(out.recipes).toHaveLength(1);
    expect(out.recipes[0]!.isStarter).toBe(false);
    expect(out.starters).toHaveLength(1);
    expect(out.starters[0]!.isStarter).toBe(true);
  });

  it("scopes the user's query to that user, and starters to nobody", async () => {
    const exec = vi.fn().mockResolvedValue([]);
    mocks.find.mockReturnValue({ sort: () => ({ exec }) });

    await listRecipes(USER);

    expect(String(mocks.find.mock.calls[0]![0].userId)).toBe(USER);
    expect(mocks.find.mock.calls[1]![0]).toEqual({ userId: null });
  });

  it("stores no total — only the ingredients cross the wire", async () => {
    mocks.find.mockReturnValue({ sort: () => ({ exec: vi.fn().mockResolvedValue([doc()]) }) });
    const out = await listRecipes(USER);
    expect(out.recipes[0]).not.toHaveProperty("protein");
    expect(out.recipes[0]).not.toHaveProperty("calories");
    expect(out.recipes[0]!.ingredients).toHaveLength(2);
  });
});

describe("createRecipe", () => {
  it("saves under the user, so a copied starter becomes theirs", async () => {
    mocks.create.mockResolvedValue(doc());
    await createRecipe(USER, {
      name: "Morning shake",
      ingredients: [{ name: "Whey", amount: "1 scoop", protein: 24, calories: 120 }],
    });
    expect(String(mocks.create.mock.calls[0]![0].userId)).toBe(USER);
  });
});

describe("deleteRecipe", () => {
  it("only deletes a recipe this user owns", async () => {
    mocks.deleteOne.mockReturnValue({ exec: vi.fn().mockResolvedValue({ deletedCount: 1 }) });
    await deleteRecipe(USER, "507f1f77bcf86cd799439012");
    const filter = mocks.deleteOne.mock.calls[0]![0];
    expect(String(filter.userId)).toBe(USER);
  });

  it("refuses a starter rather than removing a row everybody reads", async () => {
    // A starter has no userId, so the scoped delete matches nothing.
    mocks.deleteOne.mockReturnValue({ exec: vi.fn().mockResolvedValue({ deletedCount: 0 }) });
    await expect(deleteRecipe(USER, "507f1f77bcf86cd799439012")).rejects.toThrow(/not found/i);
  });

  it("rejects a malformed id instead of throwing a cast error", async () => {
    await expect(deleteRecipe(USER, "nope")).rejects.toThrow(/not found/i);
    expect(mocks.deleteOne).not.toHaveBeenCalled();
  });
});

describe("STARTER_RECIPES", () => {
  it("ships the six the design lists, each with a stable key", () => {
    expect(STARTER_RECIPES).toHaveLength(6);
    expect(new Set(STARTER_RECIPES.map((r) => r.starterKey)).size).toBe(6);
  });

  it("has every ingredient carrying its own numbers", () => {
    for (const recipe of STARTER_RECIPES) {
      expect(recipe.ingredients.length).toBeGreaterThan(0);
      for (const i of recipe.ingredients) {
        expect(i.name.length).toBeGreaterThan(0);
        expect(i.amount.length).toBeGreaterThan(0);
        expect(i.protein).toBeGreaterThanOrEqual(0);
        expect(i.calories).toBeGreaterThan(0);
      }
    }
  });

  it("sums to the totals the design frame shows", () => {
    const expected: Record<string, { protein: number; calories: number }> = {
      "three-egg-omelette": { protein: 25, calories: 320 },
      "overnight-oats-whey": { protein: 40, calories: 440 },
      "tuna-salad": { protein: 30, calories: 220 },
      "cottage-cheese-bowl": { protein: 30, calories: 250 },
      "salmon-greens": { protein: 40, calories: 410 },
      "turkey-roll-ups": { protein: 36, calories: 320 },
    };
    for (const recipe of STARTER_RECIPES) {
      const total = recipe.ingredients.reduce(
        (a, i) => ({ protein: a.protein + i.protein, calories: a.calories + i.calories }),
        { protein: 0, calories: 0 },
      );
      expect(total, recipe.starterKey).toEqual(expected[recipe.starterKey]);
    }
  });
});
