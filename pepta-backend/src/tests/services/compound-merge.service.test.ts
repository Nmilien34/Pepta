import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withTransaction: vi.fn(async (fn: () => Promise<void>) => {
    await fn();
  }),
  endSession: vi.fn(),
  compoundFindOne: vi.fn(),
  compoundFind: vi.fn(),
  compoundFindById: vi.fn(),
  compoundUpdateMany: vi.fn(),
  doseUpdateMany: vi.fn(),
  scheduleUpdateMany: vi.fn(),
  cycleFind: vi.fn(),
}));

vi.mock("mongoose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("mongoose")>();
  return {
    ...actual,
    default: {
      ...actual.default,
      startSession: vi.fn(async () => ({
        withTransaction: mocks.withTransaction,
        endSession: mocks.endSession,
      })),
    },
  };
});

vi.mock("../../models", () => ({
  CompoundModel: {
    findOne: mocks.compoundFindOne,
    find: mocks.compoundFind,
    findById: mocks.compoundFindById,
    updateMany: mocks.compoundUpdateMany,
  },
  DoseLogModel: { updateMany: mocks.doseUpdateMany },
  ScheduleModel: { updateMany: mocks.scheduleUpdateMany },
  CycleModel: { find: mocks.cycleFind },
}));

vi.mock("../../services/serializers", () => ({
  serializeWithSchema: (_schema: unknown, doc: unknown) => doc,
}));

import { mergeCompounds } from "../../services/compound-merge.service";

const objectId = (hex: string) => ({
  toString: () => hex,
  equals: (other: { toString(): string }) => other.toString() === hex,
});

const KEEPER = objectId("keep");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withTransaction.mockImplementation(async (fn: () => Promise<void>) => {
    await fn();
  });
  mocks.compoundFindOne.mockResolvedValue({ _id: KEEPER, name: "Foundayo" });
  mocks.compoundFindById.mockResolvedValue({ _id: KEEPER, name: "Foundayo" });
  mocks.compoundFind.mockResolvedValue([{ _id: objectId("loser") }]);
  mocks.doseUpdateMany.mockResolvedValue({ modifiedCount: 2 });
  mocks.scheduleUpdateMany.mockResolvedValue({ modifiedCount: 1 });
  mocks.compoundUpdateMany.mockResolvedValue({ modifiedCount: 1 });
  mocks.cycleFind.mockReturnValue({ session: () => Promise.resolve([]) });
});

describe("mergeCompounds", () => {
  it("moves dose logs onto the keeper", async () => {
    const result = await mergeCompounds("user-1", "keep", ["loser"]);

    expect(mocks.doseUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1" }),
      { $set: { compoundId: KEEPER } },
      expect.anything(),
    );
    expect(result.movedDoseLogs).toBe(2);
  });

  it("DEACTIVATES the loser's schedule rather than repointing it", async () => {
    // Repointing would leave the keeper holding two active daily schedules at
    // different hours, which the projection reads as split dosing — two
    // reminders a day for a once-daily pill.
    await mergeCompounds("user-1", "keep", ["loser"]);

    expect(mocks.scheduleUpdateMany).toHaveBeenCalledWith(
      expect.anything(),
      { $set: { active: false } },
      expect.anything(),
    );
    const repointed = mocks.scheduleUpdateMany.mock.calls.some(
      (call) => JSON.stringify(call[1]).includes("compoundId"),
    );
    expect(repointed).toBe(false);
  });

  it("soft-deletes the loser and leaves the keeper's own fields untouched", async () => {
    await mergeCompounds("user-1", "keep", ["loser"]);

    const [filter, update] = mocks.compoundUpdateMany.mock.calls[0]!;
    expect(update).toEqual({
      $set: { deletedAt: expect.any(Date), status: "completed" },
    });
    // The keeper is never in the update filter.
    expect(JSON.stringify(filter)).not.toContain("keep");
  });

  it("does everything inside one transaction", async () => {
    await mergeCompounds("user-1", "keep", ["loser"]);

    expect(mocks.withTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.endSession).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: a replayed call finds nothing live and writes nothing", async () => {
    mocks.compoundFind.mockResolvedValue([]);

    const result = await mergeCompounds("user-1", "keep", ["loser"]);

    expect(result.mergedCompoundIds).toEqual([]);
    expect(result.movedDoseLogs).toBe(0);
    expect(mocks.withTransaction).not.toHaveBeenCalled();
    expect(mocks.doseUpdateMany).not.toHaveBeenCalled();
    expect(mocks.compoundUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses to merge a compound into itself", async () => {
    await expect(mergeCompounds("user-1", "keep", ["keep"])).rejects.toThrow(
      /into itself/i,
    );
    expect(mocks.withTransaction).not.toHaveBeenCalled();
  });

  it("refuses when the keeper is not the caller's compound", async () => {
    mocks.compoundFindOne.mockResolvedValue(null);

    await expect(mergeCompounds("user-1", "keep", ["loser"])).rejects.toThrow(
      /not found/i,
    );
    expect(mocks.withTransaction).not.toHaveBeenCalled();
  });

  it("swaps the loser for the keeper in a cycle without duplicating it", async () => {
    const loser = objectId("loser");
    const cycle = {
      compoundIds: [loser, KEEPER],
      save: vi.fn(),
    };
    mocks.cycleFind.mockReturnValue({ session: () => Promise.resolve([cycle]) });

    await mergeCompounds("user-1", "keep", ["loser"]);

    expect(cycle.compoundIds.map((id) => id.toString())).toEqual(["keep"]);
    expect(cycle.save).toHaveBeenCalled();
  });

  it("adds the keeper to a cycle that only referenced the loser", async () => {
    const cycle = { compoundIds: [objectId("loser")], save: vi.fn() };
    mocks.cycleFind.mockReturnValue({ session: () => Promise.resolve([cycle]) });

    await mergeCompounds("user-1", "keep", ["loser"]);

    expect(cycle.compoundIds.map((id) => id.toString())).toEqual(["keep"]);
  });

  it("propagates a failure instead of half-applying the merge", async () => {
    mocks.withTransaction.mockRejectedValue(new Error("write conflict"));

    await expect(mergeCompounds("user-1", "keep", ["loser"])).rejects.toThrow(
      "write conflict",
    );
    expect(mocks.endSession).toHaveBeenCalledTimes(1);
  });
});
