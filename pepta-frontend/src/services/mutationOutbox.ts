// Durable mutation outbox — the missing half of "logs never get lost".
//
// THE FAILURE THIS CLOSES. Every log used to be: optimistic state → bare POST
// → on failure, silently drop the entry (a refresh removed the temp row). A
// user logging a dose in a dead zone got a success haptic and lost the log.
// The cache faithfully preserves what the server knows; this preserves what
// the server was never told.
//
// HOW IT IS SAFE TO RETRY. Every mutation carries a client-generated
// idempotency key, and the backend holds a unique {userId, idempotencyKey}
// index: replaying a POST whose response was lost returns the EXISTING row
// instead of creating a duplicate (verified against production before this
// was built). Retrying is therefore always safe, any number of times.
//
// CLASSIFICATION RULE. Only failures that can heal are queued: offline and
// server-side errors (5xx / no status). A 4xx is a request the server will
// never accept — queueing it would poison the queue forever, so it throws to
// the caller like before. Replay applies the same rule: transient failure
// stops the replay (order preserved, tried again later); a 4xx drops that
// entry and keeps going.
//
// The queue is per-user (account B never replays account A's logs) and the
// stored blob parses defensively — corrupt state reads as an empty queue.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";
import { ApiError } from "./apiError";

export type OutboxKind =
  | "dose"
  | "weight"
  | "sideEffect"
  | "measurement"
  | "activity"
  | "meal"
  | "protein"
  | "water"
  | "fiber";

export interface OutboxEntry {
  /** Client-generated idempotency key; also the entry's identity. */
  key: string;
  kind: OutboxKind;
  payload: Record<string, unknown>;
  enqueuedAt: string;
  attempts: number;
}

export type SaveResult = "saved" | "queued";

const VERSION = "v1";

export function outboxKey(userId: string): string {
  return `pepta:outbox.${VERSION}:${userId}`;
}

/** Unique enough per user+session; the server index scopes it per user. */
export function makeIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function parseOutbox(raw: string | null): OutboxEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is OutboxEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as OutboxEntry).key === "string" &&
        typeof (e as OutboxEntry).kind === "string" &&
        typeof (e as OutboxEntry).payload === "object" &&
        (e as OutboxEntry).payload !== null,
    );
  } catch {
    return [];
  }
}

/**
 * A failure is retryable when trying again later could succeed: we're offline
 * (no HTTP status ever arrived) or the server itself failed. A 4xx is final.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) return error.status >= 500;
  // No ApiError means the request never got a response: network, timeout, DNS.
  return true;
}

type LogCall = (payload: Record<string, unknown>) => Promise<unknown>;

// Payloads are validated by the api layer's zod input schemas at send time —
// the outbox stores exactly what the caller tried to send, plus the key.
const CALLS: Record<OutboxKind, LogCall> = {
  dose: (p) => api.createDoseLog(p as never),
  weight: (p) => api.createWeightLog(p as never),
  sideEffect: (p) => api.createSideEffectLog(p as never),
  measurement: (p) => api.createMeasurement(p as never),
  activity: (p) => api.createActivityLog(p as never),
  meal: (p) => api.createMealLog(p as never),
  protein: (p) => api.createProteinLog(p as never),
  water: (p) => api.createWaterLog(p as never),
  fiber: (p) => api.createFiberLog(p as never),
};

async function readEntries(userId: string): Promise<OutboxEntry[]> {
  try {
    return parseOutbox(await AsyncStorage.getItem(outboxKey(userId)));
  } catch {
    return [];
  }
}

async function writeEntries(userId: string, entries: OutboxEntry[]): Promise<void> {
  try {
    if (entries.length === 0) await AsyncStorage.removeItem(outboxKey(userId));
    else await AsyncStorage.setItem(outboxKey(userId), JSON.stringify(entries));
  } catch {
    // Storage failure degrades to the old behavior (lost on quit) — never throws.
  }
}

export async function outboxCount(userId: string): Promise<number> {
  return (await readEntries(userId)).length;
}

/**
 * Try the mutation now; queue it if the failure is retryable. Resolves
 * "saved" | "queued"; throws only for final (4xx) errors, exactly like the
 * bare call used to.
 */
export async function saveLogDurably(
  userId: string,
  kind: OutboxKind,
  payload: Record<string, unknown>,
): Promise<SaveResult> {
  const key = makeIdempotencyKey();
  const body = { ...payload, idempotencyKey: key };
  try {
    await CALLS[kind](body);
    return "saved";
  } catch (error) {
    if (!isRetryable(error)) throw error;
    const entries = await readEntries(userId);
    entries.push({
      key,
      kind,
      payload: body,
      enqueuedAt: new Date().toISOString(),
      attempts: 1,
    });
    await writeEntries(userId, entries);
    return "queued";
  }
}

/** One replay at a time per user — concurrent triggers just coalesce. */
const replaying = new Set<string>();

export interface ReplayResult {
  sent: number;
  dropped: number;
  remaining: number;
}

export async function replayOutbox(userId: string): Promise<ReplayResult> {
  if (replaying.has(userId)) return { sent: 0, dropped: 0, remaining: await outboxCount(userId) };
  replaying.add(userId);
  try {
    let entries = await readEntries(userId);
    let sent = 0;
    let dropped = 0;
    while (entries.length > 0) {
      const entry = entries[0]!;
      try {
        await CALLS[entry.kind](entry.payload);
        sent += 1;
        entries = entries.slice(1);
        await writeEntries(userId, entries);
      } catch (error) {
        if (isRetryable(error)) {
          // Still unhealthy — keep everything, in order, for next time.
          entries = [{ ...entry, attempts: entry.attempts + 1 }, ...entries.slice(1)];
          await writeEntries(userId, entries);
          break;
        }
        // Final rejection: this entry can never succeed. Dropping it is the
        // only move that doesn't wedge the queue behind it forever.
        console.warn("[outbox] dropping unacceptable entry", entry.kind, entry.key);
        dropped += 1;
        entries = entries.slice(1);
        await writeEntries(userId, entries);
      }
    }
    return { sent, dropped, remaining: entries.length };
  } finally {
    replaying.delete(userId);
  }
}
