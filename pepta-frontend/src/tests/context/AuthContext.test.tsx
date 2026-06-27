import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../../context/AuthContext";
import { AUTH_STORAGE_KEY, serializeAuth } from "../../context/authPersistence";
import { testStorage } from "../testStorage";
import { mockAuthResponse, makeAuthResponse } from "../../mocks/auth";

// AuthProvider uses the api singleton directly, so replace the whole module with
// a controllable mock (the methods AuthContext calls).
const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn(),
    signInWithDemo: vi.fn(),
    setAuthToken: vi.fn(),
    setUnauthorizedHandler: vi.fn(),
  },
}));
vi.mock("../../services/api", () => ({ api: mockApi }));

type AuthValue = ReturnType<typeof useAuth>;

async function renderAuthHarness() {
  let current: AuthValue | undefined;
  function Harness() {
    current = useAuth();
    return null;
  }
  await act(async () => {
    TestRenderer.create(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );
  });
  // Flush the async hydration effect (AsyncStorage read).
  await act(async () => {
    await Promise.resolve();
  });
  return {
    value: (): AuthValue => {
      if (!current) throw new Error("Auth context did not render");
      return current;
    },
  };
}

describe("AuthContext", () => {
  beforeEach(() => {
    testStorage.clear();
    mockApi.signInWithGoogle.mockReset();
    mockApi.signInWithDemo.mockReset();
    mockApi.setAuthToken.mockReset();
    mockApi.setUnauthorizedHandler.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("persists the session + sets the token after Google sign-in", async () => {
    mockApi.signInWithGoogle.mockResolvedValue(makeAuthResponse());
    const harness = await renderAuthHarness();
    expect(harness.value().isAuthenticated).toBe(false);

    await act(async () => {
      await harness.value().signInWithGoogle("id-token");
    });

    expect(harness.value().isAuthenticated).toBe(true);
    expect(harness.value().user?.id).toBe("user_1");
    expect(mockApi.setAuthToken).toHaveBeenCalledWith("token_1");
    expect(testStorage.snapshot()[AUTH_STORAGE_KEY]).toBeDefined();
  });

  it("persists the session + sets the token after reviewer demo sign-in", async () => {
    mockApi.signInWithDemo.mockResolvedValue(makeAuthResponse());
    const harness = await renderAuthHarness();

    await act(async () => {
      await harness
        .value()
        .signInWithDemo("review@pepta.app", "PeptaReview2026!");
    });

    expect(harness.value().isAuthenticated).toBe(true);
    expect(mockApi.signInWithDemo).toHaveBeenCalledWith(
      "review@pepta.app",
      "PeptaReview2026!",
    );
    expect(mockApi.setAuthToken).toHaveBeenCalledWith("token_1");
    expect(testStorage.snapshot()[AUTH_STORAGE_KEY]).toBeDefined();
  });

  it("clears the session + storage on logout", async () => {
    mockApi.signInWithGoogle.mockResolvedValue(makeAuthResponse());
    const harness = await renderAuthHarness();
    await act(async () => {
      await harness.value().signInWithGoogle("id-token");
    });
    expect(harness.value().isAuthenticated).toBe(true);

    await act(async () => {
      harness.value().logout();
    });

    expect(harness.value().isAuthenticated).toBe(false);
    expect(harness.value().user).toBeNull();
    expect(mockApi.setAuthToken).toHaveBeenLastCalledWith(null);
    expect(testStorage.snapshot()).toEqual({});
  });

  it("updates and persists the cached user", async () => {
    mockApi.signInWithGoogle.mockResolvedValue(makeAuthResponse());
    const harness = await renderAuthHarness();
    await act(async () => {
      await harness.value().signInWithGoogle("id-token");
    });

    await act(async () => {
      harness.value().updateCachedUser({
        ...harness.value().user!,
        displayName: "Nico Pepta",
      });
    });

    expect(harness.value().user?.displayName).toBe("Nico Pepta");
    const saved = JSON.parse(testStorage.snapshot()[AUTH_STORAGE_KEY]!);
    expect(saved.user.displayName).toBe("Nico Pepta");
  });

  it("hydrates a saved session on launch", async () => {
    testStorage.snapshot(); // noop, ensures store exists
    await testStorage.setItem(
      AUTH_STORAGE_KEY,
      serializeAuth(mockAuthResponse),
    );

    const harness = await renderAuthHarness();

    expect(harness.value().isLoading).toBe(false);
    expect(harness.value().isAuthenticated).toBe(true);
    expect(harness.value().user?.id).toBe("user_1");
    expect(mockApi.setAuthToken).toHaveBeenCalledWith("token_1");
  });

  it("registers a 401 handler that signs the user out", async () => {
    mockApi.signInWithGoogle.mockResolvedValue(makeAuthResponse());
    const harness = await renderAuthHarness();
    await act(async () => {
      await harness.value().signInWithGoogle("id-token");
    });
    expect(harness.value().isAuthenticated).toBe(true);
    expect(mockApi.setUnauthorizedHandler).toHaveBeenCalled();

    // Fire the registered handler as the api would on a 401.
    const handler = mockApi.setUnauthorizedHandler.mock.calls.at(-1)?.[0] as
      | (() => void)
      | undefined;
    expect(typeof handler).toBe("function");
    await act(async () => {
      handler?.();
    });

    expect(harness.value().isAuthenticated).toBe(false);
    expect(harness.value().user).toBeNull();
  });
});
