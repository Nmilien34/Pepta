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

// expo-constants pulls in expo-modules-core, which touches the __DEV__
// global at import time and crashes under node. Tests that care about the
// version (appUpdate.test.ts) override this with their own mock.
vi.mock("expo-constants", () => ({
  default: { expoConfig: { version: "0.0.0-test" } },
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

// expo-haptics reaches expo-modules-core (crashes on __DEV__ under node).
// Screens fire haptics fire-and-forget, so inert mocks are all tests need;
// suites asserting haptic ORDER (useSpeechHaptic) override this locally.
// PostHog's SDK is a native module like react-native-purchases above: node
// cannot parse it, and every context that touches analytics would fail at
// COLLECTION time without this. The real posthog.ts wrapper still runs — only
// the SDK edge is inert, so the null-guard and error-swallowing logic is
// exercised rather than mocked away.
vi.mock("posthog-react-native", () => ({
  default: class {
    capture() {}
    identify() {}
    reset() {}
    register() {}
  },
  PostHogMaskView: ({ children }: { children: unknown }) => children,
}));

vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn(() => Promise.resolve()),
  notificationAsync: vi.fn(() => Promise.resolve()),
  selectionAsync: vi.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Soft: "s", Light: "l", Medium: "m", Rigid: "r", Heavy: "h" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

// expo-store-review reaches expo-modules-core the same way expo-haptics does.
// The review sheet is fire-and-forget and returns nothing, so an inert mock is
// all any suite needs; reviewPrompt.test.ts injects its own doubles instead.
vi.mock("expo-store-review", () => ({
  isAvailableAsync: vi.fn(() => Promise.resolve(false)),
  requestReview: vi.fn(() => Promise.resolve()),
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
  getExpoPushTokenAsync: vi.fn(async () => ({ data: "ExponentPushToken[test]" })),
  scheduleNotificationAsync: vi.fn(async (request: { identifier?: string }) => request.identifier ?? "test-notification"),
  cancelScheduledNotificationAsync: vi.fn(async () => undefined),
  setNotificationChannelAsync: vi.fn(async () => undefined),
  setNotificationHandler: vi.fn(),
}));
