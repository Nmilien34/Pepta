// Guards from the 2026-07-29 phantom-customer investigation: twelve customer
// records with no app_id, no platform and a 0-second lifespan reached the
// production RevenueCat project. Root cause was two-layered — unit tests ran
// the unmocked reconciler against the live API with ids minted at test time,
// and production's resolveAccess reconciled EVERY user, REST-creating a
// subscriber for each fresh signup (v1 GET /subscribers/{id} creates on
// read). These tests pin every promise the fix makes.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reconcile: vi.fn(async () => null),
  configured: vi.fn(() => true),
  findById: vi.fn(),
}));

vi.mock("../services/entitlement-reconciler.service", () => ({
  reconcileUserEntitlement: mocks.reconcile,
}));
vi.mock("../services/revenuecat.client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/revenuecat.client")>();
  return { ...original, isRevenueCatConfigured: mocks.configured };
});
vi.mock("../models/user.model", () => ({
  UserModel: { findById: mocks.findById },
}));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { resolveAccess, hasRevenueCatEvidence } from "../services/access-decision.service";
import { getSubscriber, RevenueCatClientError } from "../services/revenuecat.client";

function userDoc(entitlement: Record<string, unknown>) {
  return {
    _id: new Types.ObjectId(),
    entitlement: {
      status: "free",
      expiresAt: null,
      willRenew: false,
      ...entitlement,
    },
    save: vi.fn(async () => undefined),
  };
}

beforeEach(() => {
  mocks.reconcile.mockClear();
  mocks.configured.mockReturnValue(true);
  mocks.findById.mockReset();
});

describe("resolveAccess never creates RevenueCat customers for fresh users", () => {
  it("skips reconciliation entirely for a user RevenueCat has never seen", async () => {
    // A fresh signup: status "free", no customer id, no sources. This is the
    // exact state every new user resolves in seconds after account creation.
    // Before the gate, this path REST-created their RevenueCat customer.
    mocks.findById.mockResolvedValue(userDoc({}));
    const decision = await resolveAccess(new Types.ObjectId().toString());
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(decision.state).toBe("inactive");
  });

  it("still reconciles users with RevenueCat evidence", async () => {
    mocks.findById.mockResolvedValue(
      userDoc({ revenueCatCustomerId: new Types.ObjectId().toString(), status: "active" }),
    );
    await resolveAccess(new Types.ObjectId().toString());
    expect(mocks.reconcile).toHaveBeenCalledTimes(1);
  });

  it("counts any RC trace as evidence — id, aliases, sources, or non-free status", () => {
    const base = { status: "free", expiresAt: null, willRenew: false } as never;
    expect(hasRevenueCatEvidence(base)).toBe(false);
    expect(hasRevenueCatEvidence({ ...(base as object), revenueCatCustomerId: "x" } as never)).toBe(true);
    expect(hasRevenueCatEvidence({ ...(base as object), revenueCatAppUserIds: ["x"] } as never)).toBe(true);
    expect(
      hasRevenueCatEvidence({
        ...(base as object),
        sources: [{ kind: "promotional", active: true, expiresAt: null, willRenew: false }],
      } as never),
    ).toBe(true);
    expect(hasRevenueCatEvidence({ ...(base as object), status: "canceled" } as never)).toBe(true);
  });
});

describe("getSubscriber refuses unusable ids", () => {
  it("throws loudly on empty, placeholder, and stringified-nullish ids — no network call", async () => {
    // fetch would be the phantom-creating call; it must never be reached.
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const placeholder = ["anonymous", "_rc_user"].join(""); // kept out of the literal scan
    for (const bad of ["", "   ", placeholder, "$RCAnonymousID:abc123", "undefined", "null"]) {
      await expect(getSubscriber(bad)).rejects.toBeInstanceOf(RevenueCatClientError);
    }
    await expect(getSubscriber(undefined as never)).rejects.toBeInstanceOf(RevenueCatClientError);
    await expect(getSubscriber(null as never)).rejects.toBeInstanceOf(RevenueCatClientError);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("source hygiene", () => {
  const roots = [
    join(__dirname, "..", ".."), // pepta-backend
    join(__dirname, "..", "..", "..", "shared"),
    join(__dirname, "..", "..", "..", "pepta-frontend"),
  ];

  function* sourceFiles(dir: string): Generator<string> {
    for (const name of readdirSync(dir)) {
      if (["node_modules", "dist", "ios", "android", ".git", "coverage"].includes(name)) continue;
      const full = join(dir, name);
      const stats = statSync(full);
      if (stats.isDirectory()) yield* sourceFiles(full);
      else if (/\.(ts|tsx|js|mjs)$/.test(name)) yield full;
    }
  }

  it("the placeholder id that reached production exists nowhere in the codebase", () => {
    const needle = ["anonymous", "_rc_user"].join(""); // avoid matching this file
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of sourceFiles(join(root, "src"))) {
        if (readFileSync(file, "utf8").includes(needle)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the user-creation path cannot touch RevenueCat at all", () => {
    // User documents are created in auth.service / user.service. Neither may
    // import the RevenueCat client — the only backend modules allowed to are
    // the reconciler, the webhook service, and complimentary access.
    for (const file of ["auth.service.ts", "user.service.ts"]) {
      const source = readFileSync(
        join(__dirname, "..", "services", file),
        "utf8",
      );
      expect(source.includes("revenuecat.client")).toBe(false);
      expect(source.includes("api.revenuecat.com")).toBe(false);
    }
  });
});
