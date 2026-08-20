import {
  ERROR_CODES,
  mealLogResponseSchema,
  type MealLogInput,
} from "@pepta/shared";
import { Types } from "mongoose";
import { AppError, NotFoundError } from "../lib/errors";
import { MealLogModel } from "../models";
import { createCrudService } from "./crud.service";
import {
  attachMedia,
  detachMedia,
  validateAttachableMedia,
} from "./media.service";
import { serializeWithSchema } from "./serializers";

interface DuplicateKeyError extends Error {
  code?: number;
}

function isDuplicateKey(error: unknown): error is DuplicateKeyError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as DuplicateKeyError).code === 11000
  );
}

const baseMealLogService = createCrudService({
  model: MealLogModel,
  responseSchema: mealLogResponseSchema,
  name: "Meal log",
  hasIdempotencyKey: true,
});

async function findIdempotent(userId: string, key?: string) {
  if (!key) return null;
  return MealLogModel.findOne({ userId, idempotencyKey: key, deletedAt: null });
}

export const mealLogService = {
  list: baseMealLogService.list,

  async create(userId: string, input: MealLogInput) {
    const existing = await findIdempotent(userId, input.idempotencyKey);
    if (existing) return serializeWithSchema(mealLogResponseSchema, existing);

    if (input.photoMediaId) {
      await validateAttachableMedia(userId, input.photoMediaId, "meal_log");
    }

    let document;
    try {
      document = await MealLogModel.create({
        ...input,
        datetime: new Date(input.datetime),
        ...(input.photoMediaId
          ? { photoMediaId: new Types.ObjectId(input.photoMediaId) }
          : {}),
        userId,
        deletedAt: null,
      });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const raced = await findIdempotent(userId, input.idempotencyKey);
      if (raced) return serializeWithSchema(mealLogResponseSchema, raced);
      throw new AppError({
        code: ERROR_CODES.conflict,
        message: "Meal log idempotency key is already used by a deleted log",
        statusCode: 409,
      });
    }

    if (input.photoMediaId) {
      try {
        await attachMedia(userId, input.photoMediaId, {
          kind: "meal_log",
          resourceId: document._id.toString(),
        });
      } catch (error) {
        await MealLogModel.findOneAndDelete({
          _id: document._id,
          userId: new Types.ObjectId(userId),
        }).exec();
        throw error;
      }
    }

    return serializeWithSchema(mealLogResponseSchema, document);
  },

  async softDelete(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundError("Meal log not found");
    }
    const deletedAt = new Date();
    const document = await MealLogModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), userId, deletedAt: null },
      { $set: { deletedAt } },
      { new: true, runValidators: true },
    ).exec();
    if (!document) throw new NotFoundError("Meal log not found");

    if (document.photoMediaId) {
      try {
        await detachMedia(userId, document.photoMediaId.toString(), {
          kind: "meal_log",
          resourceId: document._id.toString(),
        });
      } catch (error) {
        await MealLogModel.findOneAndUpdate(
          {
            _id: document._id,
            userId,
            deletedAt,
          },
          { $set: { deletedAt: null } },
          { new: true, runValidators: true },
        )
          .exec()
          .catch(() => undefined);
        throw error;
      }
    }

    return serializeWithSchema(mealLogResponseSchema, document);
  },
};
