import { connect, disconnect } from '../db/mongo';
import { logger } from '../lib/logger';
import { seedCatalogs } from '../seeds/catalogs.seed';

async function main(): Promise<void> {
  await connect();
  await seedCatalogs();
  logger.info('[seed] medication catalog and research library upserted');
  await disconnect();
}

void main().catch(async (error) => {
  logger.error({ error }, '[seed] failed');
  await disconnect();
  process.exitCode = 1;
});
