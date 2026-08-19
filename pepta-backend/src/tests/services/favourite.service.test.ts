import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  findOneAndUpdate: vi.fn(),
  deleteOne: vi.fn(),
}));

vi.mock("../../models/favourite.model", () => ({
  FavouriteModel: {
    find: mocks.find,
    findOneAndUpdate: mocks.findOneAndUpdate,
    deleteOne: mocks.deleteOne,
  },
}));

import {
  listFavourites,
  removeFavourite,
  saveFavourite,
} from "../../services/favourite.service";
import { STARTER_FAVOURITES } from "../../seeds/starter-favourites.seed";

const USER = "507f1f77bcf86cd799439011";

beforeEach(() => {
  mocks.find.mockReset();
  mocks.findOneAndUpdate.mockReset();
  mocks.deleteOne.mockReset();
});

function doc(over: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => "row1" },
    key: "food:chicken-breast:6-oz",
    kind: "food",
    name: "Chicken breast",
    portion: "6 oz",
    protein: 54,
    calories: 280,
    createdAt: new Date("2026-08-17T12:00:00.000Z"),
    updatedAt: new Date("2026-08-17T12:00:00.000Z"),
    ...over,
  };
}

describe("listFavourites", () => {
  it("returns newest first — the order the screen renders", async () => {
    const exec = vi.fn().mockResolvedValue([doc()]);
    const sort = vi.fn(() => ({ exec }));
    mocks.find.mockReturnValue({ sort });

    const out = await listFavourites(USER);

    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(out.favourites[0]).toMatchObject({
      id: "row1",
      key: "food:chicken-breast:6-oz",
      name: "Chicken breast",
      portion: "6 oz",
      protein: 54,
    });
    // Dates cross the wire as ISO strings.
    expect(out.favourites[0]!.createdAt).toBe("2026-08-17T12:00:00.000Z");
  });

  it("omits macros it does not have rather than sending nulls", async () => {
    const exec = vi.fn().mockResolvedValue([doc({ protein: undefined, calories: undefined })]);
    mocks.find.mockReturnValue({ sort: vi.fn(() => ({ exec })) });

    const out = await listFavourites(USER);

    expect(out.favourites[0]).not.toHaveProperty("protein");
    expect(out.favourites[0]).not.toHaveProperty("calories");
  });
});

describe("saveFavourite", () => {
  it("upserts on (user, key), so a double-tapped star is one row", async () => {
    mocks.findOneAndUpdate.mockReturnValue({ exec: vi.fn().mockResolvedValue(doc()) });

    await saveFavourite(USER, {
      key: "food:chicken-breast:6-oz",
      kind: "food",
      name: "Chicken breast",
      portion: "6 oz",
      protein: 54,
      calories: 280,
    });

    const [filter, , options] = mocks.findOneAndUpdate.mock.calls[0]!;
    expect(filter.key).toBe("food:chicken-breast:6-oz");
    expect(String(filter.userId)).toBe(USER);
    expect(options).toMatchObject({ upsert: true, new: true });
  });

  it("clears a macro the caller no longer has, instead of leaving it stale", async () => {
    mocks.findOneAndUpdate.mockReturnValue({ exec: vi.fn().mockResolvedValue(doc()) });

    // Re-saved from the Fiber screen, which knows nothing about its protein.
    await saveFavourite(USER, {
      key: "food:edamame:1-cup",
      kind: "food",
      name: "Edamame",
      portion: "1 cup",
      fiber: 8,
      calories: 188,
    });

    const update = mocks.findOneAndUpdate.mock.calls[0]![1];
    expect(update.$set).toMatchObject({ fiber: 8, calories: 188 });
    expect(update.$unset).toHaveProperty("protein");
    expect(update.$set).not.toHaveProperty("protein");
  });

  it("keeps two portions of one food as two rows", async () => {
    mocks.findOneAndUpdate.mockReturnValue({ exec: vi.fn().mockResolvedValue(doc()) });
    const base = { kind: "food" as const, name: "Chicken breast", protein: 35, calories: 185 };

    await saveFavourite(USER, { ...base, key: "food:chicken-breast:4-oz", portion: "4 oz" });
    await saveFavourite(USER, { ...base, key: "food:chicken-breast:6-oz", portion: "6 oz" });

    const keys = mocks.findOneAndUpdate.mock.calls.map((c) => c[0].key);
    expect(new Set(keys).size).toBe(2);
  });

  it("stores a drink's volume, which is what its Log button replays", async () => {
    mocks.findOneAndUpdate.mockReturnValue({
      exec: vi.fn().mockResolvedValue(doc({ kind: "drink", ounces: 16.9, protein: undefined, calories: undefined })),
    });

    const out = await saveFavourite(USER, {
      key: "drink:vita-coco:16-9-fl-oz",
      kind: "drink",
      name: "Vita Coco",
      portion: "16.9 fl oz",
      ounces: 16.9,
    });

    expect(out.ounces).toBe(16.9);
  });
});

describe("removeFavourite", () => {
  it("deletes by key for that user only", async () => {
    const exec = vi.fn().mockResolvedValue({ deletedCount: 1 });
    mocks.deleteOne.mockReturnValue({ exec });

    await removeFavourite(USER, "food:chicken-breast:6-oz");

    const filter = mocks.deleteOne.mock.calls[0]![0];
    expect(filter.key).toBe("food:chicken-breast:6-oz");
    expect(String(filter.userId)).toBe(USER);
  });

  it("is idempotent — removing something already gone is not an error", async () => {
    mocks.deleteOne.mockReturnValue({ exec: vi.fn().mockResolvedValue({ deletedCount: 0 }) });
    await expect(removeFavourite(USER, "nope")).resolves.toBeUndefined();
  });
});

describe("the seeded first-run offers", () => {
  it("come back separately from the user's own, scoped to nobody", async () => {
    const mine = doc({ name: "Chicken breast" });
    const seeded = doc({ userId: null, name: "Greek yogurt" });
    mocks.find
      .mockReturnValueOnce({ sort: () => ({ exec: vi.fn().mockResolvedValue([mine]) }) })
      .mockReturnValueOnce({ sort: () => ({ exec: vi.fn().mockResolvedValue([seeded]) }) });

    const out = await listFavourites(USER);

    expect(out.favourites.map((f) => f.name)).toEqual(["Chicken breast"]);
    expect(out.suggestions.map((f) => f.name)).toEqual(["Greek yogurt"]);
    expect(String(mocks.find.mock.calls[0]![0].userId)).toBe(USER);
    expect(mocks.find.mock.calls[1]![0]).toEqual({ userId: null });
  });

  it("ships the three the design lists, each with a stable key", () => {
    expect(STARTER_FAVOURITES).toHaveLength(3);
    expect(new Set(STARTER_FAVOURITES.map((f) => f.key)).size).toBe(3);
    expect(STARTER_FAVOURITES.filter((f) => f.kind === "drink")).toHaveLength(1);
  });

  it("carries what each one needs to be saved and logged", () => {
    for (const f of STARTER_FAVOURITES) {
      expect(f.name.length).toBeGreaterThan(0);
      expect(f.portion.length).toBeGreaterThan(0);
      if (f.kind === "drink") expect(f.ounces).toBeGreaterThan(0);
      else expect(f.protein).toBeGreaterThan(0);
    }
  });
});
