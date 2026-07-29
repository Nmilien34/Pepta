// The P0 from the data audit: this provider mounts once above AccessGate and
// used to keep all health data in memory across logout/login — account B on a
// shared device could see account A's Home/Track/Progress. These tests mount
// the REAL provider and pin the three guarantees that close it:
//   1. switching users wipes every atom before anything can read it,
//   2. a slow fetch from the previous account can never land after the switch,
//   3. the snapshot cache hydrates instantly but only from the OWN user's key.

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const storage = new Map<string, string>();
  return {
    storage,
    user: { id: "user-a" } as { id: string } | null,
    getHome: vi.fn(),
    getTrack: vi.fn(),
    getProgress: vi.fn(),
  };
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => mocks.storage.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => void mocks.storage.set(k, v)),
    removeItem: vi.fn(async (k: string) => void mocks.storage.delete(k)),
  },
}));
vi.mock("./AuthContext", () => ({
  useAuth: () => ({ user: mocks.user }),
}));
vi.mock("../services/api", () => ({
  api: {
    getHome: mocks.getHome,
    getTrack: mocks.getTrack,
    getProgress: mocks.getProgress,
    listSchedules: vi.fn(async () => []),
    listCycles: vi.fn(async () => []),
  },
}));
vi.mock("../services/aiConsent", () => ({
  hasAIDataSharingConsent: vi.fn(async () => false),
}));

import { homeResponseSchema, type HomeResponse } from "@pepta/shared";
import { PeptaDataProvider, usePeptaData } from "./PeptaDataContext";
import { snapshotKey } from "../services/peptaSnapshotStore";

const homeFixture: HomeResponse = homeResponseSchema.parse(
  JSON.parse(
    readFileSync(join(__dirname, "..", "screens", "app", "__fixtures__", "prod-home.json"), "utf8"),
  ).data,
);

// A visibly different payload for user B, derived from the same fixture.
const homeB: HomeResponse = { ...homeFixture, streakDays: 99 };

type Handle = ReturnType<typeof usePeptaData>;
let handle!: Handle;
function Probe() {
  handle = usePeptaData();
  return null;
}

async function mount() {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <PeptaDataProvider>
        <Probe />
      </PeptaDataProvider>,
    );
  });
  return tree;
}

const rerender = (tree: TestRenderer.ReactTestRenderer) =>
  act(async () => {
    tree.update(
      <PeptaDataProvider>
        <Probe />
      </PeptaDataProvider>,
    );
  });

beforeEach(() => {
  mocks.storage.clear();
  mocks.user = { id: "user-a" };
  mocks.getHome.mockReset().mockResolvedValue(homeFixture);
  mocks.getTrack.mockReset().mockRejectedValue(new Error("no track"));
  mocks.getProgress.mockReset().mockRejectedValue(new Error("no progress"));
});

describe("account isolation", () => {
  it("wipes every atom the moment the authenticated user changes", async () => {
    const tree = await mount();
    await act(async () => {
      await handle.refreshHome();
    });
    expect(handle.home?.streakDays).toBe(homeFixture.streakDays);

    // B's own background refresh must not resolve, or this test would be
    // asserting on B's legitimate fetch rather than on the wipe.
    mocks.getHome.mockImplementation(() => new Promise<HomeResponse>(() => undefined));
    mocks.user = { id: "user-b" };
    await rerender(tree);

    expect(handle.home).toBeNull();
    expect(handle.track).toBeNull();
    expect(handle.progress).toBeNull();
    expect(handle.homeError).toBeNull();
  });

  it("drops a slow fetch from the previous account instead of landing it", async () => {
    const tree = await mount();
    // A's fetch hangs until after the switch.
    let resolveA!: (value: HomeResponse) => void;
    mocks.getHome.mockImplementationOnce(
      () => new Promise<HomeResponse>((resolve) => (resolveA = resolve)),
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = handle.refreshHome();
    });

    mocks.getHome.mockImplementation(() => new Promise<HomeResponse>(() => undefined));
    mocks.user = { id: "user-b" };
    await rerender(tree);
    expect(handle.home).toBeNull();

    // A's response arrives late — it must be discarded, not shown to B.
    await act(async () => {
      resolveA(homeFixture);
      await pending;
    });
    expect(handle.home).toBeNull();
  });

  it("logout (user → null) also wipes", async () => {
    const tree = await mount();
    await act(async () => {
      await handle.refreshHome();
    });
    expect(handle.home).not.toBeNull();

    mocks.user = null;
    await rerender(tree);
    expect(handle.home).toBeNull();
  });
});

describe("snapshot cache", () => {
  it("hydrates a returning user instantly from their own snapshot, then refreshes", async () => {
    mocks.storage.set(
      snapshotKey("user-a"),
      JSON.stringify({ home: homeFixture, track: null, progress: null, savedAt: new Date().toISOString() }),
    );
    // Server is slow: hydration must not wait for it.
    let resolveServer!: (value: HomeResponse) => void;
    mocks.getHome.mockImplementation(
      () => new Promise<HomeResponse>((resolve) => (resolveServer = resolve)),
    );

    await mount();
    // Cached data visible without any fetch having resolved.
    expect(handle.home?.streakDays).toBe(homeFixture.streakDays);
    // And the background refresh replaces it when the server answers.
    await act(async () => {
      resolveServer({ ...homeFixture, streakDays: 7 });
    });
    expect(handle.home?.streakDays).toBe(7);
  });

  it("never hydrates another user's snapshot", async () => {
    mocks.storage.set(
      snapshotKey("user-a"),
      JSON.stringify({ home: homeFixture, track: null, progress: null, savedAt: new Date().toISOString() }),
    );
    mocks.user = { id: "user-b" };
    mocks.getHome.mockImplementation(() => new Promise<HomeResponse>(() => undefined));
    await mount();
    expect(handle.home).toBeNull();
  });

  it("writes fresh payloads through to the user's snapshot", async () => {
    mocks.getHome.mockResolvedValue(homeB);
    mocks.user = { id: "user-b" };
    await mount();
    await act(async () => {
      await handle.refreshHome();
    });
    const written = mocks.storage.get(snapshotKey("user-b"));
    expect(written).toBeTruthy();
    expect(JSON.parse(written!).home.streakDays).toBe(99);
  });
});
