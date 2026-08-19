// Two layers pinned here:
// 1. Placement (the onboarding gate): AccessGate mounts AppUpdateGate ONLY
//    in the onboarded shell — never mid-onboarding, never pre-auth.
// 2. The prompt itself: soft is dismissible with "Later" and logs both
//    events; hard has no "Later" and survives an Update tap.

import React from "react";
import { all } from "../tests/byLabel";
import TestRenderer, { act, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    isLoading: false,
    isAuthenticated: true,
    user: { id: "u1", onboardingComplete: true } as {
      id: string;
      onboardingComplete: boolean;
    } | null,
    logout: vi.fn(),
  },
  decision: { state: "active" } as { state: string; cachedAccess?: boolean } | null,
  checkForUpdate: vi.fn(async (): Promise<unknown> => null),
  markSoftPromptShown: vi.fn(async () => undefined),
  openAppStore: vi.fn(async () => undefined),
  logUpdatePromptShown: vi.fn(),
  logUpdatePromptAction: vi.fn(),
}));

vi.mock("react-native", () => ({
  Modal: ({ children, ...p }: { children?: React.ReactNode }) =>
    React.createElement("Modal", p, children),
  Pressable: ({ children, ...p }: { children?: React.ReactNode }) =>
    React.createElement("Pressable", p, children),
  Text: ({ children, ...p }: { children?: React.ReactNode }) =>
    React.createElement("Text", p, children),
  View: ({ children, ...p }: { children?: React.ReactNode }) =>
    React.createElement("View", p, children),
  StyleSheet: { create: (s: unknown) => s },
}));
vi.mock("@react-navigation/native", () => ({
  NavigationContainer: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("NavigationContainer", null, children),
}));
vi.mock("../theme", () => ({
  useTheme: () => ({
    colors: {
      bg: "#fff",
      surface: "#fff",
      textPrimary: "#111",
      textSecondary: "#555",
      primary: "#7C5CFC",
      onPrimary: "#fff",
    },
  }),
}));
vi.mock("../theme/typography", () => ({
  typography: { fonts: { medium: "m", semiBold: "sb", bold: "b" } },
}));
// Headless sibling in the same shell; covered by ReminderRefreshGate.test.
vi.mock("./ReminderRefreshGate", () => ({
  ReminderRefreshGate: () => React.createElement("ReminderRefreshGate"),
}));
vi.mock("../navigation/MainTabs", () => ({ MainTabs: () => React.createElement("MainTabs") }));
vi.mock("../screens/onboarding/OnboardingNavigator", () => ({
  OnboardingNavigator: () => React.createElement("OnboardingNavigator"),
}));
vi.mock("../screens/onboarding/PaywallScreen", () => ({
  PaywallScreen: () => React.createElement("PaywallScreen"),
}));
vi.mock("../screens/access/AccessSetupScreen", () => ({
  AccessSetupScreen: () => React.createElement("AccessSetupScreen"),
}));
vi.mock("../context/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("../context/AccessContext", () => ({
  useAccess: () => ({ decision: mocks.decision, resolve: vi.fn() }),
}));
vi.mock("../services/appUpdate", () => ({
  checkForUpdate: mocks.checkForUpdate,
  markSoftPromptShown: mocks.markSoftPromptShown,
  openAppStore: mocks.openAppStore,
}));
vi.mock("../services/funnelEvents", () => ({
  logUpdatePromptShown: mocks.logUpdatePromptShown,
  logUpdatePromptAction: mocks.logUpdatePromptAction,
}));

import { AccessGate } from "./AccessGate";
import { AppUpdateGate } from "./AppUpdateGate";

const SOFT_PROMPT = {
  mode: "soft" as const,
  runningVersion: "1.0.4",
  latestVersion: "1.0.5",
  title: "Update available",
  message: "A new version of Pepta is ready.",
  storeUrl: "https://apps.apple.com/app/id6784368155",
};

async function mount(element: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

function findByLabel(root: ReactTestInstance, label: string) {
  return all({ root: root }, label, "Pressable");
}

beforeEach(() => {
  mocks.auth.isAuthenticated = true;
  mocks.auth.user = { id: "u1", onboardingComplete: true };
  mocks.decision = { state: "active" };
  mocks.checkForUpdate.mockReset().mockResolvedValue(null);
  mocks.markSoftPromptShown.mockClear();
  mocks.openAppStore.mockClear();
  mocks.logUpdatePromptShown.mockClear();
  mocks.logUpdatePromptAction.mockClear();
});

describe("the onboarding gate (AccessGate placement)", () => {
  it("mounts the update gate for onboarded, active users", async () => {
    const tree = await mount(<AccessGate />);
    expect(tree.root.findAll((n) => String(n.type) === "MainTabs")).toHaveLength(1);
    expect(mocks.checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it("never mounts it mid-onboarding — the funnel is not interrupted", async () => {
    mocks.auth.user = { id: "u1", onboardingComplete: false };
    const tree = await mount(<AccessGate />);
    expect(tree.root.findAll((n) => String(n.type) === "OnboardingNavigator")).toHaveLength(1);
    expect(mocks.checkForUpdate).not.toHaveBeenCalled();
  });

  it("never mounts it pre-auth", async () => {
    mocks.auth.isAuthenticated = false;
    mocks.auth.user = null;
    await mount(<AccessGate />);
    expect(mocks.checkForUpdate).not.toHaveBeenCalled();
  });
});

describe("the prompt", () => {
  it("renders nothing when the check says show nothing", async () => {
    const tree = await mount(<AppUpdateGate />);
    expect(tree.root.findAll((n) => String(n.type) === "Modal")).toHaveLength(0);
    expect(mocks.logUpdatePromptShown).not.toHaveBeenCalled();
  });

  it("soft: Update + Later, logs shown, records the 72h throttle", async () => {
    mocks.checkForUpdate.mockResolvedValue(SOFT_PROMPT);
    const tree = await mount(<AppUpdateGate />);
    expect(findByLabel(tree.root, "Update")).toHaveLength(1);
    expect(findByLabel(tree.root, "Later")).toHaveLength(1);
    expect(mocks.markSoftPromptShown).toHaveBeenCalledTimes(1);
    expect(mocks.logUpdatePromptShown).toHaveBeenCalledWith({
      runningVersion: "1.0.4",
      latestVersion: "1.0.5",
      mode: "soft",
    });

    await act(async () => {
      findByLabel(tree.root, "Later")[0]!.props.onPress();
    });
    expect(mocks.logUpdatePromptAction).toHaveBeenCalledWith("later");
    expect(tree.root.findAll((n) => String(n.type) === "Modal")).toHaveLength(0);
  });

  it("hard: no Later, does not touch the throttle, stays up after Update", async () => {
    mocks.checkForUpdate.mockResolvedValue({ ...SOFT_PROMPT, mode: "hard" });
    const tree = await mount(<AppUpdateGate />);
    expect(findByLabel(tree.root, "Later")).toHaveLength(0);
    expect(mocks.markSoftPromptShown).not.toHaveBeenCalled();

    await act(async () => {
      findByLabel(tree.root, "Update")[0]!.props.onPress();
    });
    expect(mocks.openAppStore).toHaveBeenCalledWith(SOFT_PROMPT.storeUrl);
    expect(mocks.logUpdatePromptAction).toHaveBeenCalledWith("update");
    // Still blocking — the app stays unusable until actually updated.
    expect(tree.root.findAll((n) => String(n.type) === "Modal")).toHaveLength(1);
  });
});
