import type { LogListQuery } from "@pepta/shared";
import { ERROR_CODES } from "@pepta/shared";
import type { Model, Types } from "mongoose";
import { AppError, NotFoundError } from "../lib/errors";
import { serializeWithSchema } from "./serializers";
import type { z } from "zod";

interface LogDocumentBase {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  datetime: Date;
  deletedAt: Date | null;
  idempotencyKey?: string;
  toObject: () => unknown;
}

interface DuplicateKeyError extends Error {
  code?: number;
  keyPattern?: Record<string, unknown>;
}

interface CrudServiceConfig<
  TDocument extends LogDocumentBase,
  TResponseSchema extends z.ZodTypeAny,
> {
  model: Model<TDocument>;
  responseSchema: TResponseSchema;
  name: string;
  hasIdempotencyKey?: boolean;
}

const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isDuplicateKey(error: unknown): error is DuplicateKeyError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as DuplicateKeyError).code === 11000
  );
}

function prepareCreateBody(
  body: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => {
      if (key === "datetime" && typeof value === "string") {
        return [key, new Date(value)];
      }

      return [key, value];
    }),
  );
}

function queryWindow(query?: LogListQuery): {
  from: Date;
  to: Date;
  limit: number;
} {
  const to = query?.to
    ? new Date(query.to)
    : new Date(Date.now() + DEFAULT_FUTURE_SKEW_MS);
  const from = query?.from
    ? new Date(query.from)
    : new Date(to.getTime() - DEFAULT_LOOKBACK_DAYS * MS_PER_DAY);

  return {
    from,
    to,
    limit: query?.limit ?? 100,
  };
}

export function createCrudService<
  TDocument extends LogDocumentBase,
  TCreate extends Record<string, unknown>,
  TResponseSchema extends z.ZodTypeAny,
>(config: CrudServiceConfig<TDocument, TResponseSchema>) {
  type TResponse = z.infer<TResponseSchema>;

  async function serialize(document: TDocument): Promise<TResponse> {
    return serializeWithSchema(config.responseSchema, document);
  }

  async function findExisting(
    userId: string,
    idempotencyKey: unknown,
  ): Promise<TDocument | null> {
    if (!config.hasIdempotencyKey || typeof idempotencyKey !== "string") {
      return null;
    }

    return config.model.findOne({ userId, idempotencyKey, deletedAt: null });
  }

  return {
    async create(userId: string, body: TCreate): Promise<TResponse> {
      const prepared = prepareCreateBody(body);

      try {
        const document = await config.model.create({
          ...prepared,
          userId,
          deletedAt: null,
        });

        return serialize(document);
      } catch (error) {
        if (!isDuplicateKey(error)) {
          throw error;
        }

        const existing = await findExisting(userId, prepared.idempotencyKey);

        if (existing) {
          return serialize(existing);
        }

        throw new AppError({
          code: ERROR_CODES.conflict,
          message: `${config.name} idempotency key is already used by a deleted log`,
          statusCode: 409,
        });
      }
    },

    async list(userId: string, query?: LogListQuery): Promise<TResponse[]> {
      const window = queryWindow(query);
      const documents = await config.model
        .find({
          userId,
          // Soft-deleted logs are not history, they are corrections. This was
          // the only query in this file that did not say so — create's
          // idempotency lookup and softDelete both do — so a deleted weigh-in
          // kept being served by /progress and /track, and nothing on the
          // client filtered it either. Deleting a mistyped weight is the only
          // way to correct the chart, and it did not change the chart.
          deletedAt: null,
          datetime: {
            $gte: window.from,
            $lte: window.to,
          },
        })
        .sort({ datetime: -1 })
        .limit(window.limit);

      return Promise.all(documents.map(serialize));
    },

    /**
     * Patch one live row. The filter refuses deleted rows — a PATCH that
     * resurrects a soft-deleted log would undo a correction silently.
     * Added for Apple Health sync, whose daily row grows all day and must be
     * updated in place rather than re-created (a create per sync is the
     * resistance pile-up again).
     */
    async update(
      userId: string,
      id: string,
      patch: Partial<TCreate>,
    ): Promise<TResponse> {
      const document = await config.model.findOneAndUpdate(
        { _id: id, userId, deletedAt: null },
        { $set: patch as Record<string, unknown> },
        { new: true, runValidators: true },
      );

      if (!document) {
        throw new NotFoundError(`${config.name} not found`);
      }

      return serialize(document);
    },

    async softDelete(userId: string, id: string): Promise<TResponse> {
      const document = await config.model.findOneAndUpdate(
        { _id: id, userId },
        { $set: { deletedAt: new Date() } },
        { new: true, runValidators: true },
      );

      if (!document) {
        throw new NotFoundError(`${config.name} not found`);
      }

      return serialize(document);
    },
  };
}
