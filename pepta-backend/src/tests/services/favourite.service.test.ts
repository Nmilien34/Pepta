import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  findOneAndDelete: vi.fn(),
  deleteOne: vi.fn(),
  validateAttachableMedia: vi.fn(),
  attachMedia: vi.fn(),
  detachMedia: vi.fn(),
  getMediaViewUrl: vi.fn(),
}));

vi.mock("../../services/media.service", () => ({
  validateAttachableMedia: mocks.validateAttachableMedia,
  attachMedia: mocks.attachMedia,
  detachMedia: mocks.detachMedia,
  getMediaViewUrl: mocks.getMediaViewUrl,
}));

vi.mock("../../models/favourite.model", () => ({
  FavouriteModel: {
    find: mocks.find,
    findOne: mocks.findOne,
    findOneAndUpdate: mocks.findOneAndUpdate,
    findOneAndDelete: mocks.findOneAndDelete,
    deleteOne: mocks.deleteOne,
  },
}));

import {
  listFavourites,
  removeFavourite,
  saveFavourite,
} from "../../services/favourite.service";
import { NotFoundError } from "../../lib/errors";
import { STARTER_FAVOURITES } from "../../seeds/starter-favourites.seed";

const USER = "507f1f77bcf86cd799439011";
const MEDIA = "507f1f77bcf86cd799439012";
const OLD_MEDIA = "507f1f77bcf86cd799439013";
const OTHER_MEDIA = "507f1f77bcf86cd799439014";

beforeEach(() => {
  mocks.find.mockReset();
  mocks.findOne.mockReset().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
  mocks.findOneAndUpdate.mockReset();
  mocks.findOneAndDelete.mockReset().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
  mocks.deleteOne.mockReset().mockReturnValue({ exec: vi.fn().mockResolvedValue({ deletedCount: 1 }) });
  mocks.validateAttachableMedia.mockReset().mockResolvedValue({ _id: MEDIA });
  mocks.attachMedia.mockReset().mockResolvedValue(undefined);
  mocks.detachMedia.mockReset().mockResolvedValue(undefined);
  mocks.getMediaViewUrl.mockReset().mockResolvedValue("https://s3/signed-get");
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
  it("looks up by key for that user only, then deletes that row", async () => {
    mocks.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(doc()) });

    await removeFavourite(USER, "food:chicken-breast:6-oz");

    const filter = mocks.findOne.mock.calls[0]![0];
    expect(filter.key).toBe("food:chicken-breast:6-oz");
    expect(String(filter.userId)).toBe(USER);
    expect(mocks.deleteOne).toHaveBeenCalledTimes(1);
  });

  it("is idempotent — removing something already gone is not an error", async () => {
    mocks.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
    await expect(removeFavourite(USER, "nope")).resolves.toBeUndefined();
    expect(mocks.detachMedia).not.toHaveBeenCalled();
    expect(mocks.deleteOne).not.toHaveBeenCalled();
  });

  it("detaches the media BEFORE deleting the row, so a crash between the two leaves a retryable favourite instead of a stranded S3 object", async () => {
    const order: string[] = [];
    mocks.findOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue(doc({ photoMediaId: MEDIA })),
    });
    mocks.detachMedia.mockImplementation(async () => void order.push("detach"));
    mocks.deleteOne.mockImplementation(() => {
      order.push("delete");
      return { exec: vi.fn().mockResolvedValue({ deletedCount: 1 }) };
    });

    await removeFavourite(USER, "food:chicken-breast:6-oz");

    expect(mocks.detachMedia).toHaveBeenCalledWith(USER, MEDIA, {
      kind: "favourite",
      resourceId: "row1",
    });
    expect(order).toEqual(["detach", "delete"]);
  });

  it("keeps the row when the detach fails — nothing is deleted ahead of its cleanup authority", async () => {
    mocks.findOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue(doc({ photoMediaId: MEDIA })),
    });
    mocks.detachMedia.mockRejectedValue(new Error("mongo down"));

    await expect(removeFavourite(USER, "food:chicken-breast:6-oz")).rejects.toThrow(
      "mongo down",
    );
    expect(mocks.deleteOne).not.toHaveBeenCalled();
  });

  it("guards the delete on the photo it detached, so a concurrent photo swap is not stranded", async () => {
    mocks.findOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue(doc({ photoMediaId: MEDIA })),
    });

    await removeFavourite(USER, "food:chicken-breast:6-oz");

    expect(mocks.deleteOne.mock.calls[0]![0]).toMatchObject({ photoMediaId: MEDIA });
  });

  it("detaches nothing for an item that never had a photo", async () => {
    mocks.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(doc()) });
    await removeFavourite(USER, "food:chicken-breast:6-oz");
    expect(mocks.detachMedia).not.toHaveBeenCalled();
    // …and the delete then only matches a row that still has no photo.
    expect(mocks.deleteOne.mock.calls[0]![0]).toMatchObject({
      photoMediaId: { $exists: false },
    });
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
    const exec = vi.fn().mockResolvedValue([doc({ photoMediaId: MEDIA })]);
    mocks.find.mockReturnValue({ sort: vi.fn(() => ({ exec })) });

    const out = await listFavourites(USER);

    expect(mocks.getMediaViewUrl).toHaveBeenCalledWith(USER, MEDIA);
    expect(out.favourites[0]!.photoMediaId).toBe(MEDIA);
    expect(out.favourites[0]!.photoUrl).toBe("https://s3/signed-get");
  });

  it("sends null rather than failing the whole list when signing fails", async () => {
    mocks.getMediaViewUrl.mockRejectedValue(new Error("s3 down"));
    const exec = vi.fn().mockResolvedValue([doc({ photoMediaId: MEDIA })]);
    mocks.find.mockReturnValue({ sort: vi.fn(() => ({ exec })) });

    const out = await listFavourites(USER);

    expect(out.favourites[0]!.photoUrl).toBeNull();
    expect(out.favourites[0]!.name).toBe("Chicken breast");
  });

  it("signs nothing for an item saved without a photo", async () => {
    const exec = vi.fn().mockResolvedValue([doc()]);
    mocks.find.mockReturnValue({ sort: vi.fn(() => ({ exec })) });

    const out = await listFavourites(USER);

    expect(mocks.getMediaViewUrl).not.toHaveBeenCalled();
    expect(out.favourites[0]!.photoUrl).toBeNull();
  });

  it("attaches only the caller's ready favourite media", async () => {
    mocks.findOneAndUpdate.mockReturnValue({
      exec: vi.fn().mockResolvedValue(doc({ photoMediaId: MEDIA })),
    });

    await saveFavourite(USER, {
      key: "food:desk-lunch:1-box",
      kind: "food",
      name: "Desk lunch",
      portion: "1 box",
      source: "item",
      photoMediaId: MEDIA,
    });

    const update = mocks.findOneAndUpdate.mock.calls[0]![1] as {
      $set: Record<string, unknown>;
      $unset: Record<string, unknown>;
    };
    expect(String(update.$set.photoMediaId)).toBe(MEDIA);
    expect(mocks.validateAttachableMedia).toHaveBeenCalledWith(
      USER,
      MEDIA,
      "favourite",
    );
    expect(mocks.attachMedia).toHaveBeenCalledWith(USER, MEDIA, {
      kind: "favourite",
      resourceId: "row1",
    });
  });

  it("does not write the favourite when media ownership validation fails", async () => {
    mocks.validateAttachableMedia.mockRejectedValue(
      new NotFoundError("Media not found"),
    );

    await expect(
      saveFavourite(USER, {
        key: "food:desk-lunch:1-box",
        kind: "food",
        name: "Desk lunch",
        portion: "1 box",
        photoMediaId: OTHER_MEDIA,
      }),
    ).rejects.toThrow(/not found/i);

    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("leaves an existing photo alone when a save does not carry one", async () => {
    mocks.findOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue(doc({ photoMediaId: OLD_MEDIA })),
    });
    mocks.findOneAndUpdate.mockReturnValue({
      exec: vi.fn().mockResolvedValue(doc({ photoMediaId: OLD_MEDIA })),
    });

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
    expect(update.$set).not.toHaveProperty("photoMediaId");
    expect(update.$unset).not.toHaveProperty("photoMediaId");
    expect(mocks.attachMedia).not.toHaveBeenCalled();
    expect(mocks.detachMedia).not.toHaveBeenCalled();
  });

  it("hands back a usable URL on save, not just on the next read", async () => {
    mocks.findOneAndUpdate.mockReturnValue({
      exec: vi.fn().mockResolvedValue(doc({ photoMediaId: MEDIA })),
    });

    const out = await saveFavourite(USER, {
      key: "food:desk-lunch:1-box",
      kind: "food",
      name: "Desk lunch",
      portion: "1 box",
      source: "item",
      photoMediaId: MEDIA,
    });

    expect(out.photoUrl).toBe("https://s3/signed-get");
  });

  it("links the replacement before detaching the previous media", async () => {
    mocks.findOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue(doc({ photoMediaId: OLD_MEDIA })),
    });
    mocks.findOneAndUpdate.mockReturnValue({
      exec: vi.fn().mockResolvedValue(doc({ photoMediaId: MEDIA })),
    });

    await saveFavourite(USER, {
      key: "food:desk-lunch:1-box",
      kind: "food",
      name: "Desk lunch",
      portion: "1 box",
      photoMediaId: MEDIA,
    });

    expect(mocks.detachMedia).toHaveBeenCalledWith(USER, OLD_MEDIA, {
      kind: "favourite",
      resourceId: "row1",
    });
    expect(mocks.attachMedia.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.detachMedia.mock.invocationCallOrder[0]!,
    );
  });

  it("restores the old media reference when linking the replacement fails", async () => {
    mocks.findOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue(doc({ photoMediaId: OLD_MEDIA })),
    });
    mocks.findOneAndUpdate
      .mockReturnValueOnce({
        exec: vi.fn().mockResolvedValue(doc({ photoMediaId: MEDIA })),
      })
      .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(doc()) });
    mocks.attachMedia.mockRejectedValue(new Error("link failed"));

    await expect(
      saveFavourite(USER, {
        key: "food:desk-lunch:1-box",
        kind: "food",
        name: "Desk lunch",
        portion: "1 box",
        photoMediaId: MEDIA,
      }),
    ).rejects.toThrow("link failed");

    const rollback = mocks.findOneAndUpdate.mock.calls[1]![1] as {
      $set: { photoMediaId: unknown };
    };
    expect(String(rollback.$set.photoMediaId)).toBe(OLD_MEDIA);
    expect(mocks.detachMedia).not.toHaveBeenCalled();
  });

  it("removes a newly inserted favourite when its media cannot be linked", async () => {
    mocks.findOneAndUpdate.mockReturnValue({
      exec: vi.fn().mockResolvedValue(doc({ photoMediaId: MEDIA })),
    });
    mocks.attachMedia.mockRejectedValue(new Error("link failed"));

    await expect(
      saveFavourite(USER, {
        key: "food:desk-lunch:1-box",
        kind: "food",
        name: "Desk lunch",
        portion: "1 box",
        photoMediaId: MEDIA,
      }),
    ).rejects.toThrow("link failed");

    const rollbackFilter = mocks.findOneAndDelete.mock.calls[0]![0];
    expect(String(rollbackFilter.userId)).toBe(USER);
    expect(String(rollbackFilter.photoMediaId)).toBe(MEDIA);
    expect(rollbackFilter._id.toString()).toBe("row1");
  });
});
