import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/tests/**/*.test.ts'],
    // Strips developer-local secrets (RevenueCat key, HMAC keyring) from the
    // parsed env before any test runs — see the note in setup-env.ts.
    setupFiles: ['./src/tests/setup-env.ts'],
  },
});
