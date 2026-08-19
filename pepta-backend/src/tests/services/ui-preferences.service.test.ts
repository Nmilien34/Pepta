// Display preferences: its own endpoint, its own field, and never confusable
// with health data.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findOne: vi.fn(), findOneAndUpdate: vi.fn() }));

vi.mock("../../models", () => ({
  UserProfileModel: { findOne: mocks.findOne, findOneAndUpdate: mocks.findOneAndUpdate },
}));

import { getUiPreferences, putUiPreferences } from "../../services/ui-preferences.service";

const USER = "507f1f77bcf86cd799439011";
const NOW = new Date("2026-08-19T12:00:00.000Z");

const found = (profile: unknown) => ({ select: () => ({ exec: () => Promise.resolve(profile) }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reading preferences", () => {
  it("returns what was stored", async () => {
    mocks.findOne.mockReturnValue(
      found({ uiPreferences: { progressSections: { weight: false } }, uiPreferencesUpdatedAt: NOW }),
    );

    const out = await getUiPreferences(USER);

    expect(out.preferences.progressSections).toEqual({ weight: false });
    expect(out.updatedAt).toBe(NOW.toISOString());
  });

  it("answers with defaults for an account that has never saved any", async () => {
    mocks.findOne.mockReturnValue(found({ uiPreferences: undefined, uiPreferencesUpdatedAt: null }));

    const out = await getUiPreferences(USER);

    // Empty means "nothing chosen" — the client shows everything.
    expect(out.preferences.progressSections).toEqual({});
    expect(out.updatedAt).toBeNull();
  });

  it("does not throw mid-onboarding, before a profile exists", async () => {
    mocks.findOne.mockReturnValue(found(null));

    await expect(getUiPreferences(USER)).resolves.toMatchObject({
      preferences: { progressSections: {} },
    });
  });

  it("drops anything that is not a boolean — this is not general storage", async () => {
    mocks.findOne.mockReturnValue(
      found({ uiPreferences: { progressSections: { weight: false, junk: "yes", n: 3 } } }),
    );

    const out = await getUiPreferences(USER);

    expect(out.preferences.progressSections).toEqual({ weight: false });
  });
});

describe("writing preferences", () => {
  it("stores the whole object and stamps it", async () => {
    mocks.findOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve({ _id: "p1" }) });

    const out = await putUiPreferences(
      USER,
      { progressSections: { weight: true, eating: false } },
      NOW,
    );

    const update = mocks.findOneAndUpdate.mock.calls[0]![1] as { $set: Record<string, unknown> };
    expect(update.$set.uiPreferences).toEqual({
      progressSections: { weight: true, eating: false },
    });
    expect(update.$set.uiPreferencesUpdatedAt).toBe(NOW);
    expect(out.updatedAt).toBe(NOW.toISOString());
  });

  it("REPLACES rather than merges — turning a card back on must not read as silence", async () => {
    mocks.findOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve({ _id: "p1" }) });

    await putUiPreferences(USER, { progressSections: { weight: true } }, NOW);

    const update = mocks.findOneAndUpdate.mock.calls[0]![1] as { $set: Record<string, unknown> };
    // A $set on the whole object, not a dotted per-key merge.
    expect(Object.keys(update.$set)).toEqual(["uiPreferences", "uiPreferencesUpdatedAt"]);
  });

  it("refuses when there is no profile to attach it to", async () => {
    mocks.findOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve(null) });

    await expect(
      putUiPreferences(USER, { progressSections: { weight: true } }, NOW),
    ).rejects.toThrow(/not found/i);
  });

  it("accepts a section key the server has never heard of", async () => {
    mocks.findOneAndUpdate.mockReturnValue({ exec: () => Promise.resolve({ _id: "p1" }) });

    // A newer client hiding a card this build predates must still round-trip.
    const out = await putUiPreferences(USER, { progressSections: { brandNew: false } }, NOW);

    expect(out.preferences.progressSections).toEqual({ brandNew: false });
  });
});
