// Vitest setup (wired via vitest.config.ts setupFiles). Runs in the `node`
// environment with react-test-renderer, so we mock the native modules our
// contexts touch: AsyncStorage (→ in-memory testStorage) and a minimal
// react-native stub. Pure-helper tests don't import these, so the mocks are
// inert for them.

import { vi } from "vitest";
import { testStorage } from "./testStorage";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: testStorage,
}));

vi.mock("react-native", () => ({
  AppState: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    currentState: "active",
  },
  Platform: {
    OS: "ios",
    select: (specs: Record<string, unknown>) => specs.ios ?? specs.default,
  },
}));
