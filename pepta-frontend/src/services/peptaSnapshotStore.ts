// Last-known-data snapshot, per user, so a returning user sees their
// dashboard instantly instead of a spinner while /home /track /progress
// re-fetch. This is the durable cache layer the app never had: Home, Track
// and Progress lived only in React memory, so every cold start (and every
// re-login) began from nothing.
//
// SAFETY PROPERTIES, in order of importance:
//   1. Keyed BY USER ID. Account B on the same device can never hydrate
//      account A's snapshot — the key includes the authenticated user id.
//   2. Schema-validated on read. A snapshot written by an older build (or a
//      corrupt one) parses through the live zod response schemas; anything
//      that fails reads as "no snapshot" rather than crashing a render or
//      showing stale-shaped data.
//   3. Cache, not truth. The provider hydrates from here and immediately
//      refreshes from the server; the snapshot is overwritten by every fresh
//      payload. Nothing is ever computed from the snapshot alone.
//
// Storage is AsyncStorage (app-sandboxed, same place the onboarding draft
// already keeps health answers). Encrypting at rest is a known follow-up.

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  homeResponseSchema,
  trackResponseSchema,
  progressResponseSchema,
  type HomeResponse,
  type TrackResponse,
  type ProgressResponse,
} from "@pepta/shared";

/** Bump to invalidate every stored snapshot when the shape changes. */
const VERSION = "v1";

export interface PeptaSnapshot {
  home: HomeResponse | null;
  track: TrackResponse | null;
  progress: ProgressResponse | null;
  /** When the snapshot was last written; callers may ignore very old ones. */
  savedAt: string;
}

export function snapshotKey(userId: string): string {
  return `pepta:snapshot.${VERSION}:${userId}`;
}

/** Pure parse so the robustness is unit-testable without AsyncStorage. */
export function parseSnapshot(raw: string | null): PeptaSnapshot | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    const home = homeResponseSchema.nullable().safeParse(candidate.home ?? null);
    const track = trackResponseSchema.nullable().safeParse(candidate.track ?? null);
    const progress = progressResponseSchema.nullable().safeParse(candidate.progress ?? null);
    const savedAt = typeof candidate.savedAt === "string" ? candidate.savedAt : null;
    if (!home.success || !track.success || !progress.success || !savedAt) return null;
    if (!home.data && !track.data && !progress.data) return null;
    return { home: home.data, track: track.data, progress: progress.data, savedAt };
  } catch {
    return null;
  }
}

export async function readSnapshot(userId: string): Promise<PeptaSnapshot | null> {
  try {
    return parseSnapshot(await AsyncStorage.getItem(snapshotKey(userId)));
  } catch {
    return null;
  }
}

export async function writeSnapshot(
  userId: string,
  data: { home: HomeResponse | null; track: TrackResponse | null; progress: ProgressResponse | null },
): Promise<void> {
  try {
    if (!data.home && !data.track && !data.progress) return;
    const snapshot: PeptaSnapshot = { ...data, savedAt: new Date().toISOString() };
    await AsyncStorage.setItem(snapshotKey(userId), JSON.stringify(snapshot));
  } catch {
    // Best effort — a failed write means one slower cold start, nothing more.
  }
}

export async function clearSnapshot(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(snapshotKey(userId));
  } catch {
    // ignored
  }
}
