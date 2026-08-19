// Display preferences: what the app shows, never what it stores.
//
// ITS OWN ROUTE AND ITS OWN FIELD, deliberately. The profile response schema
// is .strict(), so adding a key there is rejected by every shipped build —
// the same reason favourite photo intents and level ranges got their own
// endpoints. And keeping preferences separate from health data means "this
// card is hidden" can never be confused with "this data is missing".

import type { UiPreferences } from "@pepta/shared";
import { UserProfileModel } from "../models";
import { NotFoundError } from "../lib/errors";

export interface UiPreferencesResult {
  preferences: UiPreferences;
  updatedAt: string | null;
}

const EMPTY: UiPreferences = { progressSections: {} };

function normalise(stored: Record<string, unknown> | undefined): UiPreferences {
  const sections = stored?.progressSections;
  if (typeof sections !== "object" || sections === null) return { progressSections: {} };
  // Only booleans survive: a client is free to send new section keys, but not
  // to turn this into arbitrary storage.
  const clean: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(sections as Record<string, unknown>)) {
    if (typeof value === "boolean") clean[key] = value;
  }
  return { progressSections: clean };
}

export async function getUiPreferences(userId: string): Promise<UiPreferencesResult> {
  const profile = await UserProfileModel.findOne({ userId })
    .select({ uiPreferences: 1, uiPreferencesUpdatedAt: 1 })
    .exec();
  if (!profile) {
    // No profile yet (mid-onboarding): defaults, not an error. The client
    // shows every card when it has no preferences, which is the same answer.
    return { preferences: EMPTY, updatedAt: null };
  }
  return {
    preferences: normalise(profile.uiPreferences),
    updatedAt: profile.uiPreferencesUpdatedAt?.toISOString() ?? null,
  };
}

/**
 * REPLACES rather than merges. The client holds the whole preference object
 * and sends all of it, so a merge here would make turning a card back ON
 * indistinguishable from not mentioning it.
 */
export async function putUiPreferences(
  userId: string,
  input: UiPreferences,
  now = new Date(),
): Promise<UiPreferencesResult> {
  const preferences = normalise(input as unknown as Record<string, unknown>);
  const profile = await UserProfileModel.findOneAndUpdate(
    { userId },
    { $set: { uiPreferences: preferences, uiPreferencesUpdatedAt: now } },
    { new: true },
  ).exec();
  if (!profile) throw new NotFoundError("Profile not found");
  return { preferences, updatedAt: now.toISOString() };
}
