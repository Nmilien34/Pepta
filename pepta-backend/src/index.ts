import { createApp } from './app';
import { connect, disconnect } from './db/mongo';
import { env } from './config/env';
import { logger } from './lib/logger';
import { PepPushScheduler } from './services/pepPushScheduler.service';
import { ComplimentaryCleanupScheduler } from './services/complimentary-access-cleanup.scheduler';
import { MediaCleanupScheduler } from './services/media-cleanup.scheduler';

export async function start(): Promise<void> {
  await connect();
  const app = createApp();
  // MISLABELLED DEPLOY, SAID OUT LOUD. A process reaching a non-local database
  // while NODE_ENV says anything but "production" has every production guard
  // switched off: the env superRefine returns early (so JWT_SECRET and
  // REVENUECAT_SECRET_API_KEY go unvalidated), the logger drops to debug on a
  // health app, and confirmProductionMutation waves destructive admin writes
  // through. This shipped that way and the only trace was a calm
  // `"env":"development"` in the boot line. It is an error now, so it is
  // greppable and alertable.
  if (env.looksDeployed && !env.isProduction) {
    logger.error(
      { nodeEnv: env.nodeEnv },
      '[server] NODE_ENV is not "production" but this process is pointed at a NON-LOCAL database. ' +
        'Production env validation, log level and destructive-write confirmations are all degraded. ' +
        'Set NODE_ENV=production.',
    );
  }

  const server = app.listen(env.port, () => {
    logger.info(
      { port: env.port, env: env.nodeEnv, deployed: env.looksDeployed },
      '[server] Pepta API listening',
    );
  });
  const scheduler = PepPushScheduler.getInstance();
  const cleanupScheduler = ComplimentaryCleanupScheduler.getInstance();
  const mediaCleanupScheduler = MediaCleanupScheduler.getInstance();

  if (!env.isTest) {
    scheduler.start();
    cleanupScheduler.start();
    mediaCleanupScheduler.start();
  }

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.info({ signal }, '[server] shutting down');
    server.close(async () => {
      scheduler.stop();
      cleanupScheduler.stop();
      mediaCleanupScheduler.stop();
      await disconnect();
      process.exit(0);
    });
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

if (require.main === module) {
  start().catch((error) => {
    logger.error({ error }, '[server] failed to start');
    process.exit(1);
  });
}
