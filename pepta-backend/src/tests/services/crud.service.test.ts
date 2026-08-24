import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createCrudService } from "../../services/crud.service";

describe("createCrudService list window", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows a small future buffer for client-created log timestamps", async () => {
    const serverNow = new Date("2026-06-23T13:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(serverNow);

    const limit = vi.fn().mockResolvedValue([]);
    const sort = vi.fn(() => ({ limit }));
    let capturedQuery: unknown;
    const find = vi.fn((query: unknown) => {
      capturedQuery = query;
      return { sort };
    });
    const service = createCrudService({
      model: { find } as never,
      responseSchema: z.object({}).passthrough(),
      name: "Test log",
    });

    await service.list("507f1f77bcf86cd799439011");

    expect(find).toHaveBeenCalledTimes(1);
    const query = capturedQuery as { datetime: { $lte: Date } } | undefined;
    expect(query).toBeDefined();
    if (!query) return;

    expect(query.datetime.$lte.getTime()).toBeGreaterThan(serverNow.getTime());
  });

  it("never lists soft-deleted logs", async () => {
    // list() was the ONE query in this file that did not filter deletedAt —
    // create's idempotency lookup and the delete path both do. So a weigh-in
    // the user deleted kept coming back from /progress and /track, and
    // nothing on the client filtered it either: it stayed on the weight
    // chart, in the start/current difference, and in the goal ring.
    //
    // Deleting a bad entry is the ONLY way to correct a mistyped weight, so
    // the one action that should fix the chart did nothing to it.
    const limit = vi.fn().mockResolvedValue([]);
    const sort = vi.fn(() => ({ limit }));
    let capturedQuery: unknown;
    const find = vi.fn((query: unknown) => {
      capturedQuery = query;
      return { sort };
    });
    const service = createCrudService({
      model: { find } as never,
      responseSchema: z.object({}).passthrough(),
      name: "Test log",
    });

    await service.list("507f1f77bcf86cd799439011");

    expect((capturedQuery as { deletedAt: unknown }).deletedAt).toBeNull();
  });

  it("update patches one LIVE row and refuses deleted ones", async () => {
    // Added for Apple Health: its one daily row grows all day and must be
    // updated in place — a create per sync is the resistance pile-up again.
    // The deletedAt filter is the safety half: a PATCH that can reach a
    // soft-deleted row would silently resurrect a correction.
    let captured: { filter?: unknown; update?: unknown } = {};
    const findOneAndUpdate = vi.fn((filter: unknown, update: unknown) => {
      captured = { filter, update };
      return Promise.resolve({ toObject: () => ({ id: "a1", steps: 7100 }) });
    });
    const service = createCrudService({
      model: { findOneAndUpdate } as never,
      responseSchema: z.object({}).passthrough(),
      name: "Test log",
    });

    await service.update("507f1f77bcf86cd799439011", "a1", { steps: 7100 } as never);

    expect(captured.filter).toMatchObject({ _id: "a1", deletedAt: null });
    // $set ONLY — a whole-document replace would erase fields the patch
    // does not mention.
    expect(captured.update).toEqual({ $set: { steps: 7100 } });
  });

  it("update throws NotFound rather than upserting", async () => {
    // An upsert here would let a patch against a deleted or foreign id mint
    // a brand-new log out of thin air.
    const findOneAndUpdate = vi.fn(() => Promise.resolve(null));
    const service = createCrudService({
      model: { findOneAndUpdate } as never,
      responseSchema: z.object({}).passthrough(),
      name: "Test log",
    });

    await expect(service.update("507f1f77bcf86cd799439011", "gone", {} as never)).rejects.toThrow(
      "Test log not found",
    );
  });
});
