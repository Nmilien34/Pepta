import type { z } from 'zod';
import type { Document } from 'mongoose';

type SerializableDocument = Document & {
  toObject: () => unknown;
};

export function serializeWithSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  document: SerializableDocument | unknown,
): z.infer<TSchema> {
  const value =
    typeof document === 'object' &&
    document !== null &&
    'toObject' in document &&
    typeof document.toObject === 'function'
      ? document.toObject()
      : document;

  return schema.parse(value);
}
