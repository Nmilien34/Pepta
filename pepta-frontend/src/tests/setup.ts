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

vi.mock("react-native-purchases", () => ({
  LOG_LEVEL: {
    VERBOSE: "VERBOSE",
    DEBUG: "DEBUG",
    INFO: "INFO",
    WARN: "WARN",
    ERROR: "ERROR",
  },
  default: {
    configure: vi.fn(),
    getOfferings: vi.fn(),
    logIn: vi.fn(),
    logOut: vi.fn(),
    purchasePackage: vi.fn(),
    restorePurchases: vi.fn(),
    setLogHandler: vi.fn(),
    setLogLevel: vi.fn(),
  },
}));

vi.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 5 },
  SchedulableTriggerInputTypes: {
    DAILY: "daily",
    DATE: "date",
    TIME_INTERVAL: "timeInterval",
    WEEKLY: "weekly",
  },
  getAllScheduledNotificationsAsync: vi.fn(async () => []),
  getPermissionsAsync: vi.fn(async () => ({ status: "granted", granted: true })),
  requestPermissionsAsync: vi.fn(async () => ({ status: "granted", granted: true })),
  scheduleNotificationAsync: vi.fn(async (request: { identifier?: string }) => request.identifier ?? "test-notification"),
  cancelScheduledNotificationAsync: vi.fn(async () => undefined),
  setNotificationChannelAsync: vi.fn(async () => undefined),
  setNotificationHandler: vi.fn(),
}));
