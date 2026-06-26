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
  try {
    await Promise.all(Object.values(models).filter(isModel).map((model) => model.syncIndexes()));
    logger.info('[mongo] indexes ensured');
  } catch (error) {
    logger.warn({ error }, '[mongo] index sync failed');
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
