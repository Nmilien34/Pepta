import { connect, disconnect } from '../db/mongo';
import { logger } from '../lib/logger';
import { seedCatalogs } from '../seeds/catalogs.seed';
import { seedStarterRecipes } from '../seeds/starter-recipes.seed';

async function main(): Promise<void> {
  await connect();
  await seedCatalogs();
  await seedStarterRecipes();
  logger.info('[seed] medication catalog, research library and starter recipes upserted');
  await disconnect();
}

void main().catch(async (error) => {
  logger.error({ error }, '[seed] failed');
  await disconnect();
  process.exitCode = 1;
});
