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
import type {
  ActivityLogInput,
  DoseLogInput,
  FiberLogInput,
  MealLogInput,
  MeasurementInput,
  ProteinLogInput,
  SideEffectLogInput,
  WaterLogInput,
  WeightLogInput,
} from "@pepta/shared";
import { api } from "./api";
import { ApiError, ResponseParseError } from "./apiError";

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
 * True when the request never left the device because WE built it wrong.
 *
 * This is not a network condition and waiting will never fix it. A zod
 * ValidationError from an api-layer `.parse()` throws synchronously, before
 * fetch — which is exactly how a malformed weight payload got classified as
 * "offline", queued at the head of the FIFO, and blocked every log behind it
 * forever. A programmer error must fail loudly, not retry forever.
 */
export function isLocalValidationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  // zod's ZodError, and anything that reports itself the same way.
  return (
    name === "ZodError" ||
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

/**
 * A failure is retryable when trying again later could succeed: we're offline
 * (no HTTP status ever arrived) or the server itself failed. A 4xx is final,
 * and so is a payload this build cannot even serialize.
 */
export function isRetryable(error: unknown): boolean {
  // The server ACCEPTED the write and we merely failed to read its reply.
  // Nothing to retry — the record exists. Checked first because this is the
  // one failure that is not a failure.
  if (error instanceof ResponseParseError) return false;
  // Never sent, and never will be. Terminal regardless of connectivity.
  if (isLocalValidationError(error)) return false;
  if (error instanceof ApiError) return error.status >= 500;
  // No ApiError means the request never got a response: network, timeout, DNS.
  return true;
}

/**
 * Belt and braces behind the classification above: no single entry may hold
 * the queue forever, whatever new failure mode we have not thought of. An
 * entry that has exhausted its attempts, or has simply sat too long to be
 * worth sending, is dropped with a loud log rather than blocking the rest.
 */
export const MAX_REPLAY_ATTEMPTS = 8;
export const MAX_ENTRY_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export function isDeadEntry(entry: OutboxEntry, now: number = Date.now()): boolean {
  if (entry.attempts >= MAX_REPLAY_ATTEMPTS) return true;
  const enqueued = Date.parse(entry.enqueuedAt);
  return Number.isFinite(enqueued) && now - enqueued > MAX_ENTRY_AGE_MS;
}

/**
 * Each entry takes the payload its api method takes, WITH the idempotency key
 * the outbox stamps on — so the types have to admit that key exists.
 *
 * This deliberately no longer uses `as never`. That cast is what let a weight
 * payload carrying an idempotencyKey compile against a schema that had no such
 * field: TypeScript knew and was told to be quiet, and the mismatch only
 * surfaced at runtime, on a user's device, as silently lost data. If a kind
 * here stops type-checking, that is the compiler reporting a real schema
 * disagreement — fix the schema, do not re-add the cast.
 */
type WithIdempotencyKey<T> = T & { idempotencyKey: string };

interface OutboxCalls {
  dose(payload: WithIdempotencyKey<DoseLogInput>): Promise<unknown>;
  weight(payload: WithIdempotencyKey<WeightLogInput>): Promise<unknown>;
  sideEffect(payload: WithIdempotencyKey<SideEffectLogInput>): Promise<unknown>;
  measurement(payload: WithIdempotencyKey<MeasurementInput>): Promise<unknown>;
  activity(payload: WithIdempotencyKey<ActivityLogInput>): Promise<unknown>;
  meal(payload: WithIdempotencyKey<MealLogInput>): Promise<unknown>;
  protein(payload: WithIdempotencyKey<ProteinLogInput>): Promise<unknown>;
  water(payload: WithIdempotencyKey<WaterLogInput>): Promise<unknown>;
  fiber(payload: WithIdempotencyKey<FiberLogInput>): Promise<unknown>;
}

const TYPED_CALLS: OutboxCalls = {
  dose: (p) => api.createDoseLog(p),
  weight: (p) => api.createWeightLog(p),
  sideEffect: (p) => api.createSideEffectLog(p),
  measurement: (p) => api.createMeasurement(p),
  activity: (p) => api.createActivityLog(p),
  meal: (p) => api.createMealLog(p),
  protein: (p) => api.createProteinLog(p),
  water: (p) => api.createWaterLog(p),
  fiber: (p) => api.createFiberLog(p),
};

// The stored payload is an opaque record (it round-trips through JSON), so the
// dispatch boundary needs one widening — but the TYPED_CALLS table above is
// what the compiler actually checks each method's payload against.
const CALLS: Record<OutboxKind, (payload: Record<string, unknown>) => Promise<unknown>> =
  TYPED_CALLS as unknown as Record<
    OutboxKind,
    (payload: Record<string, unknown>) => Promise<unknown>
  >;

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
    // A 2xx whose body we could not parse IS a successful write. Queuing it
    // would tell the user their log had not synced while it sat on the server,
    // and the replay would then lean on the idempotency key to undo our own
    // confusion. Report it as what it is.
    if (error instanceof ResponseParseError) return "saved";
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

      // RECOVERY FOR ALREADY-POISONED QUEUES. A device that shipped with the
      // old build may be holding a weight entry that could never send, with
      // real logs stranded behind it. Now that weight payloads validate, that
      // entry simply succeeds on this pass. Anything still undeliverable —
      // too many attempts, or too old to be worth sending — is dropped here
      // so the queue behind it drains either way.
      if (isDeadEntry(entry)) {
        console.warn(
          "[outbox] dropping dead entry",
          entry.kind,
          entry.key,
          `attempts=${entry.attempts}`,
          `enqueuedAt=${entry.enqueuedAt}`,
        );
        dropped += 1;
        entries = entries.slice(1);
        await writeEntries(userId, entries);
        continue;
      }

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
        console.warn(
          "[outbox] dropping unacceptable entry",
          entry.kind,
          entry.key,
          isLocalValidationError(error)
            ? "(payload this build cannot serialize)"
            : "(server refused it)",
        );
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
