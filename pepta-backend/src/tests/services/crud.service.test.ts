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
});
