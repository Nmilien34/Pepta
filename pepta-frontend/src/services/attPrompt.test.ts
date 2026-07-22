import { describe, expect, it, vi } from "vitest";
import { createAttLaunchPrompt } from "./attPrompt";

type Listener = (state: string) => void;

function makeHarness(overrides: {
  platformOS?: string;
  initialAppState?: string;
  status?: string;
  requestResult?: string;
} = {}) {
  const listeners = new Set<Listener>();
  const getTrackingPermissions = vi.fn(async () => ({
    status: overrides.status ?? "undetermined",
    granted: false,
  }));
  const requestTrackingPermissions = vi.fn(async () => ({
    status: overrides.requestResult ?? "granted",
    granted: (overrides.requestResult ?? "granted") === "granted",
  }));
  const prompt = createAttLaunchPrompt({
    platformOS: overrides.platformOS ?? "ios",
    currentAppState: () => overrides.initialAppState ?? "active",
    onAppStateChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getTrackingPermissions,
    requestTrackingPermissions,
    settleDelayMs: 0,
    delay: async () => undefined,
  });
  const goActive = async (): Promise<void> => {
    listeners.forEach((listener) => listener("active"));
    await flush();
  };
  return {
    prompt,
    listeners,
    getTrackingPermissions,
    requestTrackingPermissions,
    goActive,
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("AttLaunchPrompt", () => {
  it("requests ATT at launch when the app is already active and status is undetermined", async () => {
    const h = makeHarness();
    h.prompt.start();
    await flush();

    expect(h.getTrackingPermissions).toHaveBeenCalledTimes(1);
    expect(h.requestTrackingPermissions).toHaveBeenCalledTimes(1);
    // Determined result → subscription released.
    expect(h.listeners.size).toBe(0);
  });

  it("waits for the app to become active before requesting", async () => {
    const h = makeHarness({ initialAppState: "background" });
    h.prompt.start();
    await flush();

    expect(h.requestTrackingPermissions).not.toHaveBeenCalled();

    await h.goActive();
    expect(h.requestTrackingPermissions).toHaveBeenCalledTimes(1);
  });

  it("does not prompt again when the status is already determined", async () => {
    const h = makeHarness({ status: "granted" });
    h.prompt.start();
    await flush();

    expect(h.requestTrackingPermissions).not.toHaveBeenCalled();
    expect(h.listeners.size).toBe(0);
  });

  it("retries on the next foreground when iOS suppresses the dialog", async () => {
    const h = makeHarness({ requestResult: "undetermined" });
    h.prompt.start();
    await flush();

    // Suppressed → still subscribed for another go.
    expect(h.requestTrackingPermissions).toHaveBeenCalledTimes(1);
    expect(h.listeners.size).toBe(1);

    await h.goActive();
    expect(h.requestTrackingPermissions).toHaveBeenCalledTimes(2);
  });

  it("does nothing on non-iOS platforms", async () => {
    const h = makeHarness({ platformOS: "android" });
    h.prompt.start();
    await flush();

    expect(h.getTrackingPermissions).not.toHaveBeenCalled();
    expect(h.listeners.size).toBe(0);
  });

  it("start() is idempotent", async () => {
    const h = makeHarness();
    h.prompt.start();
    h.prompt.start();
    await flush();

    expect(h.requestTrackingPermissions).toHaveBeenCalledTimes(1);
  });

  it("stops for good once tracking is unavailable (e.g. restricted devices)", async () => {
    const h = makeHarness({ status: "unavailable" });
    h.prompt.start();
    await flush();

    expect(h.requestTrackingPermissions).not.toHaveBeenCalled();
    expect(h.listeners.size).toBe(0);
  });
});
