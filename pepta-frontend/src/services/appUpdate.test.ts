// The update check must be generic (no version literals — everything flows
// from expo-constants vs the endpoint), compare real semver, throttle soft
// prompts to once per 72h, and fail open on absolutely everything.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  version: "1.0.4" as string | undefined,
  openURL: vi.fn(async () => undefined),
}));

vi.mock("expo-constants", () => ({
  default: {
    get expoConfig() {
      return { version: mocks.version };
    },
  },
}));

vi.mock("react-native", () => ({
  Linking: { openURL: mocks.openURL },
}));

import { testStorage } from "../tests/testStorage";
import {
  checkForUpdate,
  compareVersions,
  isSoftPromptThrottled,
  markSoftPromptShown,
  openAppStore,
  selectUpdateMode,
} from "./appUpdate";

const HOUR_MS = 60 * 60 * 1000;

function stubEndpoint(data: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ data }) })),
  );
}

const baseConfig = {
  latestVersion: "1.0.5",
  minimumVersion: null,
  forceUpdate: false,
  title: "Update available",
  message: "A new version of Pepta is ready.",
  storeUrl: "https://apps.apple.com/app/id6784368155",
};

beforeEach(() => {
  vi.unstubAllGlobals();
  testStorage.clear();
  mocks.version = "1.0.4";
  mocks.openURL.mockClear();
  mocks.openURL.mockResolvedValue(undefined);
});

describe("compareVersions", () => {
  it("orders multi-digit segments numerically — 1.0.10 is newer than 1.0.9", () => {
    expect(compareVersions("1.0.10", "1.0.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.9", "1.0.10")).toBeLessThan(0);
    // The string comparison this replaces gets that exact case wrong.
    expect("1.0.10" < "1.0.9").toBe(true);
  });

  it("handles equality, missing segments, and major/minor ordering", () => {
    expect(compareVersions("1.0.4", "1.0.4")).toBe(0);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.1", "1.0.99")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0", "1.99.99")).toBeGreaterThan(0);
  });

  it("treats garbage segments as 0 instead of throwing", () => {
    expect(compareVersions("1.x.4", "1.0.4")).toBe(0);
    expect(compareVersions("1.x.4", "1.2.0")).toBeLessThan(0);
    expect(compareVersions("", "0.0.0")).toBe(0);
  });
});

describe("selectUpdateMode", () => {
  it("soft when running < latest, nothing when current or ahead", () => {
    expect(selectUpdateMode("1.0.4", baseConfig)).toBe("soft");
    expect(selectUpdateMode("1.0.5", baseConfig)).toBeNull();
    expect(selectUpdateMode("1.0.6", baseConfig)).toBeNull();
  });

  it("hard only when below the minimum AND forceUpdate is armed", () => {
    const gated = { ...baseConfig, minimumVersion: "1.0.2", forceUpdate: true };
    expect(selectUpdateMode("1.0.1", gated)).toBe("hard");
    // At or above the floor: back to soft against latest.
    expect(selectUpdateMode("1.0.2", gated)).toBe("soft");
    // Dormant without the flag, even below the floor.
    expect(selectUpdateMode("1.0.1", { ...gated, forceUpdate: false })).toBe("soft");
    // A minimum with the flag but no latest still hard-gates.
    expect(
      selectUpdateMode("1.0.1", { ...gated, latestVersion: null }),
    ).toBe("hard");
  });

  it("bricking guard: never hard-gates someone already on the newest known version", () => {
    // Misconfig: floor typo'd ABOVE the real store release. Users on the
    // latest have nothing to update to — a non-dismissible gate would brick
    // them. They must see nothing at all.
    const typoFloor = {
      latestVersion: "1.0.5",
      minimumVersion: "1.0.6",
      forceUpdate: true,
    };
    expect(selectUpdateMode("1.0.5", typoFloor)).toBeNull();
    expect(selectUpdateMode("1.0.6", typoFloor)).toBeNull();
    // Users genuinely behind still get gated (updating to 1.0.5 then
    // releases them via the guard above — self-healing, no loop).
    expect(selectUpdateMode("1.0.3", typoFloor)).toBe("hard");
  });

  it("null latestVersion with no gate means show nothing", () => {
    expect(selectUpdateMode("1.0.4", { ...baseConfig, latestVersion: null })).toBeNull();
  });
});

describe("the 72-hour soft throttle", () => {
  it("suppresses within 72h of a shown prompt and releases after, surviving 'relaunch'", async () => {
    const now = Date.now();
    await markSoftPromptShown(now);
    // Same storage, fresh call — the persistence IS the relaunch survival.
    expect(await isSoftPromptThrottled(now + 71 * HOUR_MS)).toBe(true);
    expect(await isSoftPromptThrottled(now + 73 * HOUR_MS)).toBe(false);
  });

  it("suppresses checkForUpdate's soft prompt but never a hard gate", async () => {
    await markSoftPromptShown(Date.now());
    stubEndpoint(baseConfig);
    expect(await checkForUpdate()).toBeNull();
    stubEndpoint({ ...baseConfig, minimumVersion: "1.0.5", forceUpdate: true });
    const prompt = await checkForUpdate();
    expect(prompt?.mode).toBe("hard");
  });

  it("a garbage stored timestamp fails open", async () => {
    await testStorage.setItem("pepta:updatePrompt.softShownAt.v1", "not-a-date");
    expect(await isSoftPromptThrottled(Date.now())).toBe(false);
  });
});

describe("checkForUpdate fail-open contract", () => {
  it("returns a soft prompt when the endpoint reports a newer version", async () => {
    stubEndpoint(baseConfig);
    const prompt = await checkForUpdate();
    expect(prompt).toMatchObject({
      mode: "soft",
      runningVersion: "1.0.4",
      latestVersion: "1.0.5",
      storeUrl: baseConfig.storeUrl,
    });
  });

  it("network error → null, silently", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect(await checkForUpdate()).toBeNull();
  });

  it("non-200, malformed body, and null latestVersion all → null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    expect(await checkForUpdate()).toBeNull();
    stubEndpoint("what even is this");
    expect(await checkForUpdate()).toBeNull();
    stubEndpoint({ ...baseConfig, latestVersion: null });
    expect(await checkForUpdate()).toBeNull();
  });

  it("no readable running version → null (never guesses)", async () => {
    mocks.version = undefined;
    stubEndpoint(baseConfig);
    expect(await checkForUpdate()).toBeNull();
  });
});

describe("openAppStore", () => {
  it("tries itms-apps first, falls back to https", async () => {
    await openAppStore("https://apps.apple.com/app/id6784368155");
    expect(mocks.openURL).toHaveBeenCalledWith("itms-apps://apps.apple.com/app/id6784368155");
    mocks.openURL.mockClear();
    mocks.openURL
      .mockRejectedValueOnce(new Error("no store app"))
      .mockResolvedValueOnce(undefined);
    await openAppStore("https://apps.apple.com/app/id6784368155");
    expect(mocks.openURL).toHaveBeenLastCalledWith("https://apps.apple.com/app/id6784368155");
  });
});
