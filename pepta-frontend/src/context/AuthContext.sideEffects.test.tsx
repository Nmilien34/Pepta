// Authentication must survive its own side effects.
//
// The bug this pins: a friend of Nick's created an account, Google verified
// them, the backend issued a session — and the app showed "We couldn't sign
// you in with Google. Please try again." Killing and relaunching the app
// signed them straight in.
//
// That contradiction is the fingerprint of the defect. finalizeAuth set the
// token and PERSISTED the session, then awaited AppsFlyer init, the
// registration event, and RevenueCat identify BEFORE setAuth. Anything that
// rejected (or never settled) in that stretch left the user authenticated on
// disk and signed out in memory: the sheet's catch showed the generic Google
// error for a sign-in that had succeeded, and the next cold launch restored
// the session it had just denied. The launch path had the same shape, so a
// flaky SDK could also bounce a returning user to sign-in.
//
// The rule now: analytics and billing identification are best effort. They
// run, their failures are logged, but nothing they do can decide whether
// somebody is signed in.

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  apiSignInWithGoogle: vi.fn(),
  setAuthToken: vi.fn(),
  linkRevenueCatAppUserId: vi.fn(async () => ({})),
  afInitialize: vi.fn(async () => true),
  afLogCompleteRegistration: vi.fn(async () => undefined),
  rcIdentify: vi.fn(async () => undefined),
  rcConfigure: vi.fn(async () => undefined),
  rcCurrentAppUserId: vi.fn(() => "rc-user"),
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
    setAuthToken: mocks.setAuthToken,
    setUnauthorizedHandler: vi.fn(),
    linkRevenueCatAppUserId: mocks.linkRevenueCatAppUserId,
  },
}));
vi.mock("../services/appsFlyer", () => ({
  appsFlyer: {
    initialize: mocks.afInitialize,
    logCompleteRegistration: mocks.afLogCompleteRegistration,
  },
}));
vi.mock("../services/revenueCat", () => ({
  revenueCat: {
    identify: mocks.rcIdentify,
    configure: mocks.rcConfigure,
    currentAppUserId: mocks.rcCurrentAppUserId,
    reset: vi.fn(async () => undefined),
  },
}));

import { AuthProvider, useAuth } from "./AuthContext";

// Passes the STRICT userResponseSchema — hydration runs the stored blob
// through it, and a fixture it rejects tests nothing.
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
const RESPONSE = { token: "jwt-1", user: USER, isNewUser: true };

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
  vi.useRealTimers();
  mocks.storage.clear();
  mocks.apiSignInWithGoogle.mockResolvedValue(RESPONSE);
  mocks.afInitialize.mockResolvedValue(true);
  mocks.rcIdentify.mockResolvedValue(undefined);
  mocks.rcCurrentAppUserId.mockReturnValue("rc-user");
});

describe("sign-in survives every side effect failing", () => {
  // One test per saboteur, because each was an independent way to strand the
  // user — and each helper's internal catch is one refactor away from gone.
  const SABOTAGE: Array<[name: string, arm: () => void]> = [
    ["AppsFlyer init rejects", () => mocks.afInitialize.mockRejectedValue(new Error("af down"))],
    [
      "the registration event rejects",
      () => mocks.afLogCompleteRegistration.mockRejectedValue(new Error("af event")),
    ],
    ["RevenueCat identify rejects", () => mocks.rcIdentify.mockRejectedValue(new Error("rc down"))],
    [
      "reading the RC customer id THROWS synchronously",
      () =>
        mocks.rcCurrentAppUserId.mockImplementation(() => {
          // A sync throw skips every .catch() attached to promises around it —
          // the case the per-helper guards cannot cover.
          throw new Error("not configured");
        }),
    ],
    [
      "linking the RC customer id rejects",
      () => mocks.linkRevenueCatAppUserId.mockRejectedValue(new Error("500")),
    ],
  ];

  it.each(SABOTAGE)("still signs in when %s", async (_name, arm) => {
    arm();
    await mount();

    await act(async () => {
      await handle.signInWithGoogle("id-token");
    });

    // The user is IN. This resolving (and user being set) is the whole fix —
    // before it, this call rejected and the UI showed the Google error.
    expect(handle.user?.id).toBe("507f1f77bcf86cd799439011");
  });

  it("still signs in when a side effect HANGS, within a bounded wait", async () => {
    vi.useFakeTimers();
    // Never settles: the stall that no catch anywhere can save you from.
    mocks.rcIdentify.mockImplementation(() => new Promise(() => undefined));
    await mount();

    let done = false;
    let signIn!: Promise<unknown>;
    act(() => {
      signIn = handle.signInWithGoogle("id-token").then(() => {
        done = true;
      });
    });

    // Not signed in instantly — the budget is a cap, not a bypass.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(done).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
      await signIn;
    });
    expect(done).toBe(true);
    expect(handle.user?.id).toBe("507f1f77bcf86cd799439011");
  });

  it("a real auth failure still fails — the guard is not a blanket catch", async () => {
    // The server saying no must keep saying no. Only the SIDE EFFECTS lost
    // the power to fail a sign-in.
    mocks.apiSignInWithGoogle.mockRejectedValue(new Error("401"));
    await mount();

    await expect(
      act(async () => {
        await handle.signInWithGoogle("id-token");
      }),
    ).rejects.toThrow("401");
    expect(handle.user).toBeNull();
  });
});

describe("launch hydration survives them too", () => {
  it("restores the stored session even when both SDKs reject", async () => {
    // The same defect on the launch path bounced a user with a perfectly good
    // stored session back to sign-in whenever an SDK failed at startup.
    mocks.storage.set("pepta.auth.v1", JSON.stringify(RESPONSE));
    mocks.afInitialize.mockRejectedValue(new Error("af down"));
    mocks.rcIdentify.mockRejectedValue(new Error("rc down"));

    await mount();

    expect(handle.user?.id).toBe("507f1f77bcf86cd799439011");
    expect(handle.isLoading).toBe(false);
  });
});
