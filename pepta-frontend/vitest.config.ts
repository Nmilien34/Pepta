import { defineConfig } from "vitest/config";

// Pepta tests run in the `node` environment (pure orchestrators + react-test-
// renderer harnesses — no DOM). setup.ts mocks the native modules contexts touch.
// Default include is kept so colocated *.test.ts(x) files are still discovered.
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Image requires (the welcome carousel's cards) are asset references under
  // Metro; node cannot parse them, so point them at an inert stub.
  resolve: {
    alias: [
      {
        find: /^.*\.(png|jpe?g|gif|webp|svg)$/,
        replacement: fileURLToPath(new URL("./src/tests/assetStub.ts", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "node",
    setupFiles: ["./src/tests/setup.ts"],
  },
});
