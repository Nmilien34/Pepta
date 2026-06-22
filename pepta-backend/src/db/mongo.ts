import mongoose from 'mongoose';
import { env } from '../config/env';
import { logger } from '../lib/logger';

export async function connect(): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  const connection = await mongoose.connect(env.mongoUri);
  logger.info({ database: connection.connection.name }, '[mongo] connected');
  return connection;
}

export async function disconnect(): Promise<void> {
  await mongoose.disconnect();
  logger.info('[mongo] disconnected');
}

export async function isDatabaseReachable(): Promise<boolean> {
  return mongoose.connection.readyState === 1;
}
