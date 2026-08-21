import type { Query, Schema } from 'mongoose';
import { Types } from 'mongoose';

type ApiRecord = Record<string, unknown> & {
  _id?: unknown;
  __v?: unknown;
  id?: unknown;
};

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Types.ObjectId) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        serializeValue(entry),
      ]),
    );
  }

  return value;
}

function transformForApi(_doc: unknown, ret: ApiRecord): ApiRecord {
  const serialized = serializeValue(ret) as ApiRecord;
  serialized.id = ret._id instanceof Types.ObjectId ? ret._id.toString() : String(ret._id);
  delete serialized._id;
  delete serialized.__v;

  return serialized;
}

/**
 * @param omit storage-only paths to drop from the API shape.
 *
 * Response schemas are STRICT: they reject unknown keys rather than ignoring
 * them, so a persistence field that is not part of the contract does not get
 * quietly dropped — it throws. `uiPreferencesUpdatedAt` on the user profile
 * (declared `default: null`, so present on EVERY document) took /home's whole
 * profile section down that way in production on 2026-08-21, returning
 * `profile: null` with the raw zod error in sectionErrors.
 *
 * Declaring the omission on the MODEL is what makes it unforgettable — a new
 * serialization call site inherits it, where a fix at the call site would not.
 */
export function applyApiTransforms(schema: Schema, omit: readonly string[] = []): void {
  const options = {
    virtuals: false,
    transform(doc: unknown, ret: ApiRecord): ApiRecord {
      const serialized = transformForApi(doc, ret);
      for (const path of omit) delete serialized[path];
      return serialized;
    },
  };

  schema.set('toJSON', options);
  schema.set('toObject', options);
}

export function applySoftDeleteQueryMiddleware(schema: Schema): void {
  schema.pre(/^find/, function excludeDeleted(this: Query<unknown, unknown>, next) {
    const filter = this.getFilter() as Record<string, unknown>;

    if (!Object.hasOwn(filter, 'deletedAt')) {
      this.where({ deletedAt: null });
    }

    next();
  });
}

export function applyLogIndexes(schema: Schema, hasIdempotencyKey = true): void {
  schema.index({ userId: 1, datetime: -1 });
  schema.index({ userId: 1, deletedAt: 1 });

  if (hasIdempotencyKey) {
    schema.index(
      { userId: 1, idempotencyKey: 1 },
      {
        unique: true,
        partialFilterExpression: {
          idempotencyKey: { $type: 'string' },
        },
      },
    );
  }
}
