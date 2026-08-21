import mongoose, { type Model } from 'mongoose';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import * as models from '../models';

const isModel = (value: unknown): value is Model<unknown> =>
  typeof (value as { syncIndexes?: unknown })?.syncIndexes === 'function';

export async function connect(): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  const connection = await mongoose.connect(env.mongoUri);
  logger.info({ database: connection.connection.name }, '[mongo] connected');
  // Reconcile every model's indexes with its schema on boot. syncIndexes (not
  // createIndexes) drops stale indexes + recreates changed ones, so adding or
  // changing an index in code actually propagates to the live DB. Failures are
  // logged but don't block boot.
  // allSettled, NOT all. With Promise.all a single rejecting model — mealscans,
  // whose unique photoMediaId index could not build over legacy documents —
  // collapsed the whole batch into one anonymous warning: the log named no
  // model, and the outcome of every other sync was discarded. You could not
  // tell from production logs whether the rest had succeeded.
  const modelExports: readonly unknown[] = Object.values(models);
  const targets = modelExports.filter(isModel);
  const results = await Promise.allSettled(targets.map((model) => model.syncIndexes()));
  const failures = results
    .map((result, i) => ({ result, name: targets[i]?.modelName ?? 'unknown' }))
    .filter((entry): entry is { result: PromiseRejectedResult; name: string } =>
      entry.result.status === 'rejected',
    );
  if (failures.length === 0) {
    logger.info({ models: targets.length }, '[mongo] indexes ensured');
  } else {
    for (const failure of failures) {
      logger.warn(
        { model: failure.name, error: failure.result.reason },
        '[mongo] index sync failed for model',
      );
    }
    logger.warn(
      { failed: failures.length, ok: results.length - failures.length },
      '[mongo] index sync completed with failures',
    );
  }
  return connection;
}

export async function disconnect(): Promise<void> {
  await mongoose.disconnect();
  logger.info('[mongo] disconnected');
}

export async function isDatabaseReachable(): Promise<boolean> {
  return mongoose.connection.readyState === 1;
}
