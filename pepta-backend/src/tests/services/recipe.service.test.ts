import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  attachMedia: vi.fn(),
  detachMedia: vi.fn(),
  find: vi.fn(),
  findOne: vi.fn(),
  findOneAndDelete: vi.fn(),
  deleteOne: vi.fn(),
  create: vi.fn(),
  getMediaViewUrl: vi.fn(),
  validateAttachableMedia: vi.fn(),
}));

vi.mock("../../models/recipe.model", () => ({
  RecipeModel: {
    find: mocks.find,
    findOne: mocks.findOne,
    findOneAndDelete: mocks.findOneAndDelete,
    deleteOne: mocks.deleteOne,
    create: mocks.create,
  },
}));

vi.mock("../../services/media.service", () => ({
  attachMedia: mocks.attachMedia,
  detachMedia: mocks.detachMedia,
  getMediaViewUrl: mocks.getMediaViewUrl,
  validateAttachableMedia: mocks.validateAttachableMedia,
}));

import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  listRecipes,
} from "../../services/recipe.service";
import { STARTER_RECIPES } from "../../seeds/starter-recipes.seed";

const USER = "507f1f77bcf86cd799439011";
const MEDIA = "507f1f77bcf86cd799439013";

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
  vi.clearAllMocks();
  mocks.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
  mocks.findOneAndDelete.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
  mocks.deleteOne.mockReturnValue({ exec: vi.fn().mockResolvedValue({ deletedCount: 1 }) });
  mocks.validateAttachableMedia.mockResolvedValue({});
  mocks.attachMedia.mockResolvedValue(undefined);
  mocks.detachMedia.mockResolvedValue(undefined);
  mocks.getMediaViewUrl.mockResolvedValue("https://signed.example/recipe.jpg");
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

  it("signs owned recipe media and degrades a failed signature to null", async () => {
    mocks.find
      .mockReturnValueOnce({
        sort: () => ({
          exec: vi.fn().mockResolvedValue([doc({ photoMediaId: { toString: () => MEDIA } })]),
        }),
      })
      .mockReturnValueOnce({
        sort: () => ({ exec: vi.fn().mockResolvedValue([]) }),
      });
    mocks.getMediaViewUrl.mockRejectedValueOnce(new Error("signing unavailable"));

    const out = await listRecipes(USER);

    expect(mocks.getMediaViewUrl).toHaveBeenCalledWith(USER, MEDIA);
    expect(out.recipes[0]!.photoMediaId).toBe(MEDIA);
    expect(out.recipes[0]!.photoUrl).toBeNull();
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

  it("validates, attaches, and signs an owned meal photo", async () => {
    mocks.create.mockResolvedValue(
      doc({ photoMediaId: { toString: () => MEDIA } }),
    );

    const result = await createRecipe(USER, {
      name: "Morning shake",
      ingredients: [
        { name: "Whey", amount: "1 scoop", protein: 24, calories: 120 },
      ],
      photoMediaId: MEDIA,
    });

    expect(mocks.validateAttachableMedia).toHaveBeenCalledWith(
      USER,
      MEDIA,
      "recipe",
    );
    expect(mocks.attachMedia).toHaveBeenCalledWith(USER, MEDIA, {
      kind: "recipe",
      resourceId: "r1",
    });
    expect(result).toMatchObject({
      photoMediaId: MEDIA,
      photoUrl: "https://signed.example/recipe.jpg",
    });
  });

  it("removes a new recipe when its media link cannot be committed", async () => {
    const linkError = new Error("link failed");
    mocks.create.mockResolvedValue(
      doc({ photoMediaId: { toString: () => MEDIA } }),
    );
    mocks.attachMedia.mockRejectedValueOnce(linkError);
    mocks.findOneAndDelete.mockReturnValueOnce({
      exec: vi.fn().mockResolvedValue(doc()),
    });

    await expect(
      createRecipe(USER, {
        name: "Morning shake",
        ingredients: [
          { name: "Whey", amount: "1 scoop", protein: 24, calories: 120 },
        ],
        photoMediaId: MEDIA,
      }),
    ).rejects.toBe(linkError);
    expect(mocks.findOneAndDelete).toHaveBeenCalledWith({
      _id: expect.anything(),
      userId: expect.anything(),
    });
  });
});

describe("getRecipe", () => {
  it("returns an owned recipe with a refreshed signed photo URL", async () => {
    mocks.findOne.mockReturnValueOnce({
      exec: vi
        .fn()
        .mockResolvedValue(doc({ photoMediaId: { toString: () => MEDIA } })),
    });

    const result = await getRecipe(USER, "507f1f77bcf86cd799439012");

    expect(mocks.findOne).toHaveBeenCalledWith({
      _id: expect.anything(),
      $or: [{ userId: expect.anything() }, { userId: null }],
    });
    expect(result.photoUrl).toBe("https://signed.example/recipe.jpg");
  });

  it("does not expose another user's recipe", async () => {
    await expect(
      getRecipe(USER, "507f1f77bcf86cd799439012"),
    ).rejects.toThrow(/not found/i);
  });
});

describe("deleteRecipe", () => {
  it("only deletes a recipe this user owns, detaching the media FIRST", async () => {
    const order: string[] = [];
    mocks.findOne.mockReturnValue({
      exec: vi
        .fn()
        .mockResolvedValue(doc({ photoMediaId: { toString: () => MEDIA } })),
    });
    mocks.detachMedia.mockImplementation(async () => void order.push("detach"));
    mocks.deleteOne.mockImplementation(() => {
      order.push("delete");
      return { exec: vi.fn().mockResolvedValue({ deletedCount: 1 }) };
    });

    await deleteRecipe(USER, "507f1f77bcf86cd799439012");

    const filter = mocks.findOne.mock.calls[0]![0];
    expect(String(filter.userId)).toBe(USER);
    expect(mocks.detachMedia).toHaveBeenCalledWith(USER, MEDIA, {
      kind: "recipe",
      resourceId: "r1",
    });
    // Detach-before-delete: a crash between the two must leave a retryable
    // recipe, never a stranded S3 object.
    expect(order).toEqual(["detach", "delete"]);
  });

  it("keeps the recipe when the detach fails", async () => {
    mocks.findOne.mockReturnValue({
      exec: vi
        .fn()
        .mockResolvedValue(doc({ photoMediaId: { toString: () => MEDIA } })),
    });
    mocks.detachMedia.mockRejectedValue(new Error("mongo down"));

    await expect(deleteRecipe(USER, "507f1f77bcf86cd799439012")).rejects.toThrow(
      "mongo down",
    );
    expect(mocks.deleteOne).not.toHaveBeenCalled();
  });

  it("refuses a starter rather than removing a row everybody reads", async () => {
    // A starter has no userId, so the scoped lookup matches nothing.
    await expect(deleteRecipe(USER, "507f1f77bcf86cd799439012")).rejects.toThrow(/not found/i);
    expect(mocks.deleteOne).not.toHaveBeenCalled();
  });

  it("rejects a malformed id instead of throwing a cast error", async () => {
    await expect(deleteRecipe(USER, "nope")).rejects.toThrow(/not found/i);
    expect(mocks.findOne).not.toHaveBeenCalled();
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
