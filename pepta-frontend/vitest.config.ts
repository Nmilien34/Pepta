import { defineConfig } from "vitest/config";

// Pepta tests run in the `node` environment (pure orchestrators + react-test-
// renderer harnesses — no DOM). setup.ts mocks the native modules contexts touch.
// Default include is kept so colocated *.test.ts(x) files are still discovered.
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./src/tests/setup.ts"],
  },
});
