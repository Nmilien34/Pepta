import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  findOneAndUpdate: vi.fn(),
  findOneAndDelete: vi.fn(),
  exists: vi.fn(),
  deleteS3Object: vi.fn(),
  createPresignedGetUrl: vi.fn(),
  createPresignedPutUrl: vi.fn(),
}));

vi.mock("../../services/s3.service", () => ({
  createPresignedGetUrl: mocks.createPresignedGetUrl,
  createPresignedPutUrl: mocks.createPresignedPutUrl,
  deleteS3Object: mocks.deleteS3Object,
  signedUrlExpiresAt: () => "2026-08-19T12:15:00.000Z",
}));

vi.mock("../../models/favourite.model", () => ({
  FavouriteModel: {
    find: mocks.find,
    findOneAndUpdate: mocks.findOneAndUpdate,
    findOneAndDelete: mocks.findOneAndDelete,
    exists: mocks.exists,
  },
}));

import {
  createFavouritePhotoIntent,
  discardFavouritePhoto,
  listFavourites,
  removeFavourite,
  saveFavourite,
} from "../../services/favourite.service";
import { STARTER_FAVOURITES } from "../../seeds/starter-favourites.seed";

const USER = "507f1f77bcf86cd799439011";

beforeEach(() => {
  mocks.find.mockReset();
  mocks.findOneAndUpdate.mockReset();
  mocks.findOneAndDelete.mockReset().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
  mocks.deleteS3Object.mockReset().mockResolvedValue(undefined);
  mocks.exists.mockReset().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
  mocks.createPresignedGetUrl.mockReset().mockResolvedValue("https://s3/signed-get");
  mocks.createPresignedPutUrl.mockReset().mockResolvedValue("https://s3/signed-put");
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
    mocks.findOneAndDelete.mockReturnValue({ exec: vi.fn().mockResolvedValue(doc()) });

    await removeFavourite(USER, "food:chicken-breast:6-oz");

    const filter = mocks.findOneAndDelete.mock.calls[0]![0];
    expect(filter.key).toBe("food:chicken-breast:6-oz");
    expect(String(filter.userId)).toBe(USER);
  });

  it("is idempotent — removing something already gone is not an error", async () => {
    mocks.findOneAndDelete.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
    await expect(removeFavourite(USER, "nope")).resolves.toBeUndefined();
    expect(mocks.deleteS3Object).not.toHaveBeenCalled();
  });

  it("takes the photo with it, rather than leaking the file into the bucket", async () => {
    mocks.findOneAndDelete.mockReturnValue({
      exec: vi.fn().mockResolvedValue(doc({ photoS3Key: "favourites/u1/a.jpg" })),
    });

    await removeFavourite(USER, "food:chicken-breast:6-oz");

    expect(mocks.deleteS3Object).toHaveBeenCalledWith("favourites/u1/a.jpg");
  });

  it("deletes nothing in S3 for an item that never had a photo", async () => {
    mocks.findOneAndDelete.mockReturnValue({ exec: vi.fn().mockResolvedValue(doc()) });
    await removeFavourite(USER, "food:chicken-breast:6-oz");
    expect(mocks.deleteS3Object).not.toHaveBeenCalled();
  });

  it("still reports the removal when the bucket cleanup fails — the row is gone", async () => {
    mocks.findOneAndDelete.mockReturnValue({
      exec: vi.fn().mockResolvedValue(doc({ photoS3Key: "favourites/u1/a.jpg" })),
    });
    mocks.deleteS3Object.mockRejectedValue(new Error("s3 down"));

    await expect(removeFavourite(USER, "food:chicken-breast:6-oz")).resolves.toBeUndefined();
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

describe("photos on an item the user made themselves", () => {
  it("signs a fresh URL on every read — a stored one would expire in the database", async () => {
    const exec = vi.fn().mockResolvedValue([doc({ photoS3Key: "favourites/u1/a.jpg" })]);
    mocks.find.mockReturnValue({ sort: vi.fn(() => ({ exec })) });

    const out = await listFavourites(USER);

    expect(mocks.createPresignedGetUrl).toHaveBeenCalledWith({ key: "favourites/u1/a.jpg" });
    expect(out.favourites[0]!.photoUrl).toBe("https://s3/signed-get");
  });

  it("sends null rather than failing the whole list when signing fails", async () => {
    mocks.createPresignedGetUrl.mockRejectedValue(new Error("s3 down"));
    const exec = vi.fn().mockResolvedValue([doc({ photoS3Key: "favourites/u1/a.jpg" })]);
    mocks.find.mockReturnValue({ sort: vi.fn(() => ({ exec })) });

    const out = await listFavourites(USER);

    expect(out.favourites[0]!.photoUrl).toBeNull();
    expect(out.favourites[0]!.name).toBe("Chicken breast");
  });

  it("signs nothing for an item saved without a photo", async () => {
    const exec = vi.fn().mockResolvedValue([doc()]);
    mocks.find.mockReturnValue({ sort: vi.fn(() => ({ exec })) });

    const out = await listFavourites(USER);

    expect(mocks.createPresignedGetUrl).not.toHaveBeenCalled();
    expect(out.favourites[0]!.photoUrl).toBeNull();
  });

  it("stores the key the client uploaded to", async () => {
    mocks.findOneAndUpdate.mockReturnValue({
      exec: vi.fn().mockResolvedValue(doc({ photoS3Key: "favourites/u1/a.jpg" })),
    });

    await saveFavourite(USER, {
      key: "food:desk-lunch:1-box",
      kind: "food",
      name: "Desk lunch",
      portion: "1 box",
      source: "item",
      photoS3Key: "favourites/u1/a.jpg",
    });

    const update = mocks.findOneAndUpdate.mock.calls[0]![1] as {
      $set: Record<string, unknown>;
      $unset: Record<string, unknown>;
    };
    expect(update.$set).toMatchObject({ photoS3Key: "favourites/u1/a.jpg" });
  });

  it("leaves an existing photo alone when a save does not carry one", async () => {
    mocks.findOneAndUpdate.mockReturnValue({ exec: vi.fn().mockResolvedValue(doc()) });

    await saveFavourite(USER, {
      key: "food:desk-lunch:1-box",
      kind: "food",
      name: "Desk lunch",
      portion: "1 box",
      source: "item",
    });

    const update = mocks.findOneAndUpdate.mock.calls[0]![1] as {
      $set: Record<string, unknown>;
      $unset: Record<string, unknown>;
    };
    expect(update.$set).not.toHaveProperty("photoS3Key");
    expect(update.$unset).not.toHaveProperty("photoS3Key");
  });

  it("hands back a usable URL on save, not just on the next read", async () => {
    mocks.findOneAndUpdate.mockReturnValue({
      exec: vi.fn().mockResolvedValue(doc({ photoS3Key: "favourites/u1/a.jpg" })),
    });

    const out = await saveFavourite(USER, {
      key: "food:desk-lunch:1-box",
      kind: "food",
      name: "Desk lunch",
      portion: "1 box",
      source: "item",
      photoS3Key: "favourites/u1/a.jpg",
    });

    expect(out.photoUrl).toBe("https://s3/signed-get");
  });

  it("keys an upload under the owner, so one user cannot write over another", async () => {
    const a = await createFavouritePhotoIntent(USER, "image/jpeg");
    const b = await createFavouritePhotoIntent("507f1f77bcf86cd799439012", "image/jpeg");

    expect(a.photoS3Key.startsWith(`favourites/${USER}/`)).toBe(true);
    expect(b.photoS3Key.startsWith("favourites/507f1f77bcf86cd799439012/")).toBe(true);
  });

  it("never reuses a key, so a second photo cannot overwrite the first", async () => {
    const a = await createFavouritePhotoIntent(USER, "image/jpeg");
    const b = await createFavouritePhotoIntent(USER, "image/jpeg");
    expect(a.photoS3Key).not.toBe(b.photoS3Key);
  });

  it("gives the file the extension its type says it has", async () => {
    expect((await createFavouritePhotoIntent(USER, "image/png")).photoS3Key.endsWith(".png")).toBe(true);
    expect((await createFavouritePhotoIntent(USER, "image/webp")).photoS3Key.endsWith(".webp")).toBe(true);
    expect((await createFavouritePhotoIntent(USER, "image/jpeg")).photoS3Key.endsWith(".jpg")).toBe(true);
  });

  it("signs the PUT for that exact key and type", async () => {
    const out = await createFavouritePhotoIntent(USER, "image/webp");
    expect(mocks.createPresignedPutUrl).toHaveBeenCalledWith({
      key: out.photoS3Key,
      contentType: "image/webp",
    });
    expect(out.uploadUrl).toBe("https://s3/signed-put");
    expect(out.expiresAt).toBe("2026-08-19T12:15:00.000Z");
  });
});

describe("throwing away a photo nothing ended up using", () => {
  const KEY = `favourites/${USER}/a.jpg`;

  it("deletes the file when nothing references it", async () => {
    await discardFavouritePhoto(USER, KEY);
    expect(mocks.deleteS3Object).toHaveBeenCalledWith(KEY);
  });

  it("refuses a key under another user, however it was obtained", async () => {
    await expect(
      discardFavouritePhoto(USER, "favourites/507f1f77bcf86cd799439012/a.jpg"),
    ).rejects.toThrow(/not found/i);
    expect(mocks.deleteS3Object).not.toHaveBeenCalled();
  });

  it("refuses a key outside the favourites prefix", async () => {
    await expect(discardFavouritePhoto(USER, "progress/other/a.jpg")).rejects.toThrow(/not found/i);
    await expect(discardFavouritePhoto(USER, `../favourites/${USER}/a.jpg`)).rejects.toThrow(
      /not found/i,
    );
    expect(mocks.deleteS3Object).not.toHaveBeenCalled();
  });

  it("refuses a photo a saved item is still showing", async () => {
    mocks.exists.mockReturnValue({ exec: vi.fn().mockResolvedValue({ _id: "row1" }) });

    await expect(discardFavouritePhoto(USER, KEY)).rejects.toThrow(/saved item/i);
    expect(mocks.deleteS3Object).not.toHaveBeenCalled();
  });

  it("checks that reference against the caller's own rows", async () => {
    await discardFavouritePhoto(USER, KEY);
    const filter = mocks.exists.mock.calls[0]![0] as { userId: unknown; photoS3Key: string };
    expect(String(filter.userId)).toBe(USER);
    expect(filter.photoS3Key).toBe(KEY);
  });
});
