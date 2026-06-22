import { createApp } from './app';
import { connect, disconnect } from './db/mongo';
import { env } from './config/env';
import { logger } from './lib/logger';

export async function start(): Promise<void> {
  await connect();
  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info({ port: env.port, env: env.nodeEnv }, '[server] Pepta API listening');
  });

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.info({ signal }, '[server] shutting down');
    server.close(async () => {
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
