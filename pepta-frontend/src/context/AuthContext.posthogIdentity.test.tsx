// PostHog identity must follow the session, not the device.
//
// The reset half is the one that matters. This codebase has already been bitten
// by state outliving a sign-out on a shared device — it is why logout() purges
// the offline snapshot and clears the purchase grace window. A PostHog identity
// left behind is the same class of bug with a worse blast radius: the next
// person to sign in continues the previous user's PERSON and their session
// RECORDING, on a health app.
//
// Account deletion is covered by the same assertion on purpose:
// AccountDetailsScreen calls logout() after api.deleteAccount(), so the reset
// wired into logout serves both paths. If someone ever gives deletion its own
// teardown, that is the moment this test should be extended rather than
// trusted.
//
// Real AuthProvider, real posthog module. Only the SDK client is faked.

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  apiSignInWithGoogle: vi.fn(),
  identifyCalls: [] as Array<{ id: string; props?: Record<string, unknown> }>,
  resetCalls: 0,
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => mocks.storage.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => void mocks.storage.set(k, v)),
    removeItem: vi.fn(async (k: string) => void mocks.storage.delete(k)),
  },
}));
vi.mock("../services/api", () => ({
  api: {
    signInWithGoogle: mocks.apiSignInWithGoogle,
    setAuthToken: vi.fn(),
    setUnauthorizedHandler: vi.fn(),
    linkRevenueCatAppUserId: vi.fn(async () => ({})),
  },
}));
vi.mock("../services/appsflyer", () => ({
  appsFlyer: {
    initialize: vi.fn(async () => true),
    logCompleteRegistration: vi.fn(async () => undefined),
  },
}));
vi.mock("../services/revenueCat", () => ({
  revenueCat: {
    identify: vi.fn(async () => undefined),
    configure: vi.fn(async () => undefined),
    currentAppUserId: vi.fn(() => "rc-user"),
    reset: vi.fn(async () => undefined),
  },
}));
vi.mock("posthog-react-native", () => ({ default: class {} }));

import { AuthProvider, useAuth } from "./AuthContext";
import { resetPostHogInitForTest, setPostHogClientForTest } from "../services/posthog";

const USER = {
  id: "507f1f77bcf86cd799439011",
  email: "friend@example.com",
  emailVerified: true,
  displayName: "Friend",
  hasAvatar: false,
  authProviders: [],
  entitlement: { status: "free", expiresAt: null, willRenew: false },
  onboardingComplete: false,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

type Handle = ReturnType<typeof useAuth>;
let handle!: Handle;
function Probe() {
  handle = useAuth();
  return null;
}

async function mount() {
  await act(async () => {
    TestRenderer.create(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storage.clear();
  mocks.identifyCalls = [];
  mocks.resetCalls = 0;
  mocks.apiSignInWithGoogle.mockResolvedValue({
    token: "jwt-1",
    user: USER,
    isNewUser: true,
  });
  resetPostHogInitForTest();
  setPostHogClientForTest({
    capture: vi.fn(),
    identify: (id: string, props?: Record<string, unknown>) => {
      mocks.identifyCalls.push({ id, props });
    },
    reset: () => {
      mocks.resetCalls += 1;
    },
  } as never);
});

describe("PostHog identity follows the session", () => {
  it("identifies with the backend user id on sign-in", async () => {
    await mount();
    await act(async () => {
      await handle.signInWithGoogle("google-token");
    });

    expect(mocks.identifyCalls).toHaveLength(1);
    expect(mocks.identifyCalls[0]!.id).toBe(USER.id);
  });

  it("sends no PII and no health data as person properties", async () => {
    await mount();
    await act(async () => {
      await handle.signInWithGoogle("google-token");
    });

    const props = mocks.identifyCalls[0]!.props ?? {};
    // Allowlist, not a denylist: a future edit that adds a field has to come
    // back through this assertion rather than slip past a list of banned keys.
    expect(Object.keys(props).sort()).toEqual(["platform"]);
    const serialised = JSON.stringify(props);
    expect(serialised).not.toContain(USER.email);
    expect(serialised).not.toContain(USER.displayName);
  });

  it("resets on sign-out so the next session cannot stitch to it", async () => {
    await mount();
    await act(async () => {
      await handle.signInWithGoogle("google-token");
    });
    expect(mocks.resetCalls).toBe(0);

    await act(async () => {
      handle.logout();
    });

    expect(mocks.resetCalls).toBe(1);
  });

  it("does not throw when PostHog never initialised", async () => {
    setPostHogClientForTest(null);
    await mount();

    await act(async () => {
      await handle.signInWithGoogle("google-token");
    });
    await act(async () => {
      handle.logout();
    });

    expect(handle.user).toBeNull();
  });
});
