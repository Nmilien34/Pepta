import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  attachMedia: vi.fn(),
  create: vi.fn(),
  detachMedia: vi.fn(),
  find: vi.fn(),
  findOne: vi.fn(),
  findOneAndDelete: vi.fn(),
  findOneAndUpdate: vi.fn(),
  validateAttachableMedia: vi.fn(),
}));

vi.mock("../../models", () => ({
  MealLogModel: {
    create: mocks.create,
    find: mocks.find,
    findOne: mocks.findOne,
    findOneAndDelete: mocks.findOneAndDelete,
    findOneAndUpdate: mocks.findOneAndUpdate,
  },
}));

vi.mock("../../services/media.service", () => ({
  attachMedia: mocks.attachMedia,
  detachMedia: mocks.detachMedia,
  validateAttachableMedia: mocks.validateAttachableMedia,
}));

import { mealLogService } from "../../services/meal-log.service";

const USER = "507f1f77bcf86cd799439011";
const MEDIA = "507f1f77bcf86cd799439012";
const MEAL = "507f1f77bcf86cd799439013";

const input = {
  foodName: "Chicken rice bowl",
  protein: 42,
  calories: 640,
  source: "scan" as const,
  datetime: "2026-08-19T12:00:00.000Z",
  photoMediaId: MEDIA,
  idempotencyKey: "meal-1",
};

function document(overrides: Record<string, unknown> = {}) {
  const value = {
    id: MEAL,
    userId: USER,
    ...input,
    deletedAt: null,
    createdAt: "2026-08-19T12:00:01.000Z",
    updatedAt: "2026-08-19T12:00:01.000Z",
    ...overrides,
  };
  return {
    ...value,
    _id: { toString: () => String(value.id) },
    photoMediaId: value.photoMediaId
      ? { toString: () => String(value.photoMediaId) }
      : undefined,
    toObject: () => value,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findOne.mockResolvedValue(null);
  mocks.validateAttachableMedia.mockResolvedValue({});
  mocks.attachMedia.mockResolvedValue(undefined);
  mocks.detachMedia.mockResolvedValue(undefined);
  mocks.create.mockResolvedValue(document());
  mocks.findOneAndDelete.mockReturnValue({ exec: vi.fn().mockResolvedValue(document()) });
  mocks.findOneAndUpdate.mockReturnValue({ exec: vi.fn().mockResolvedValue(document()) });
});

describe("mealLogService media lifecycle", () => {
  it("validates and attaches owned ready meal media to a new log", async () => {
    const result = await mealLogService.create(USER, input);

    expect(mocks.validateAttachableMedia).toHaveBeenCalledWith(
      USER,
      MEDIA,
      "meal_log",
    );
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        photoMediaId: expect.anything(),
        datetime: new Date(input.datetime),
        deletedAt: null,
      }),
    );
    expect(mocks.attachMedia).toHaveBeenCalledWith(USER, MEDIA, {
      kind: "meal_log",
      resourceId: MEAL,
    });
    expect(result.photoMediaId).toBe(MEDIA);
  });

  it("returns an existing idempotent log without trying to reattach stale media", async () => {
    mocks.findOne.mockResolvedValueOnce(document());

    const result = await mealLogService.create(USER, input);

    expect(result.id).toBe(MEAL);
    expect(mocks.validateAttachableMedia).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.attachMedia).not.toHaveBeenCalled();
  });

  it("removes a new log when its media link cannot be committed", async () => {
    const linkError = new Error("link failed");
    mocks.attachMedia.mockRejectedValueOnce(linkError);

    await expect(mealLogService.create(USER, input)).rejects.toBe(linkError);

    expect(mocks.findOneAndDelete).toHaveBeenCalledWith({
      _id: expect.anything(),
      userId: expect.anything(),
    });
  });

  it("soft-deletes an owned log and detaches its exact media link", async () => {
    mocks.findOneAndUpdate.mockReturnValueOnce({
      exec: vi.fn().mockResolvedValue(
        document({ deletedAt: "2026-08-19T13:00:00.000Z" }),
      ),
    });

    await mealLogService.softDelete(USER, MEAL);

    expect(mocks.detachMedia).toHaveBeenCalledWith(USER, MEDIA, {
      kind: "meal_log",
      resourceId: MEAL,
    });
  });

  it("keeps photo-free log deletion on the normal path", async () => {
    mocks.findOneAndUpdate.mockReturnValueOnce({
      exec: vi.fn().mockResolvedValue(
        document({
          photoMediaId: undefined,
          deletedAt: "2026-08-19T13:00:00.000Z",
        }),
      ),
    });

    await mealLogService.softDelete(USER, MEAL);

    expect(mocks.detachMedia).not.toHaveBeenCalled();
  });
});
