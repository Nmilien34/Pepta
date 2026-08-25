// A production boot must not be able to sign sessions with the committed
// development JWT secret. The secret lives in this repo, so a build using it
// can have a token forged for ANY user id — auth/middleware.ts sets
// req.user = { id: payload.sub } and every requireAuth route trusts it.
//
// This is checked by VALUE rather than by adding the key to
// requiredProductionKeys, because that loop tests truthiness and JWT_SECRET
// carries a .default() — it is never falsy, so the list can never catch it.
import { afterEach, describe, expect, it, vi } from 'vitest';

const DEV_JWT_SECRET = 'dev_test_secret_replace_me_with_real_secret_64_chars_minimum_value';
const REAL_SECRET = 'x'.repeat(64);

const PROD_ENV = {
  NODE_ENV: 'production',
  AWS_REGION: 'us-east-1',
  AWS_S3_BUCKET_NAME: 'b',
  AWS_ACCESS_KEY_ID: 'k',
  AWS_SECRET_ACCESS_KEY: 's',
  OPENAI_API_KEY: 'o',
  TOGETHER_API_KEY: 't',
  REVENUECAT_WEBHOOK_SECRET: 'w',
  REVENUECAT_SECRET_API_KEY: 'r',
};

async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  const previous = { ...process.env };
  for (const [k, v] of Object.entries({ ...PROD_ENV, ...overrides })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await import('../config/env');
  } finally {
    process.env = previous;
  }
}

afterEach(() => vi.resetModules());

describe('production env guards', () => {
  // NOT TESTED HERE: the unset case. config/env runs dotenv against the repo
  // root, which re-adds JWT_SECRET from a developer's local .env the moment we
  // delete it — the exact trap setup-env.ts documents. It needs no assertion
  // anyway: with the var unset, zod applies the default, so the value check
  // below is what catches it. That is also the real production path, where
  // there is no .env file for dotenv to find.

  it('refuses to boot production with the committed development secret', async () => {
    await expect(loadEnv({ JWT_SECRET: DEV_JWT_SECRET })).rejects.toThrow();
  });

  it('boots production with a real secret', async () => {
    await expect(loadEnv({ JWT_SECRET: REAL_SECRET })).resolves.toBeDefined();
  });
});
