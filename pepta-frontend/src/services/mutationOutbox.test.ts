// The outbox is the "logs never get lost" guarantee, so these tests cover the
// failure grammar exhaustively: queue on transient, throw on final, replay in
// order, stop on transient mid-replay, drop poison entries, dedupe by key.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const storage = new Map<string, string>();
  return { storage, createProteinLog: vi.fn(), createDoseLog: vi.fn() };
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => mocks.storage.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => void mocks.storage.set(k, v)),
    removeItem: vi.fn(async (k: string) => void mocks.storage.delete(k)),
  },
}));
vi.mock("./api", () => ({
  api: {
    createProteinLog: mocks.createProteinLog,
    createDoseLog: mocks.createDoseLog,
    createWeightLog: vi.fn(),
    createSideEffectLog: vi.fn(),
    createMeasurement: vi.fn(),
    createActivityLog: vi.fn(),
    createMealLog: vi.fn(),
    createWaterLog: vi.fn(),
    createFiberLog: vi.fn(),
  },
}));

import { ApiError, ResponseParseError } from "./apiError";
import {
  isRetryable,
  makeIdempotencyKey,
  MAX_REPLAY_ATTEMPTS,
  isDeadEntry,
  outboxCount,
  outboxKey,
  parseOutbox,
  replayOutbox,
  saveLogDurably,
} from "./mutationOutbox";

const NOW = "2026-08-21T12:00:00.000Z";
const offline = () => new TypeError("Network request failed");
const serverDown = () => new ApiError(503, "SERVICE_UNAVAILABLE", "down");
const rejected = () => new ApiError(422, "VALIDATION", "bad payload");

beforeEach(() => {
  mocks.storage.clear();
  mocks.createProteinLog.mockReset();
  mocks.createDoseLog.mockReset();
});

describe("classification", () => {
  it("retries offline and 5xx; never retries 4xx", () => {
    expect(isRetryable(offline())).toBe(true);
    expect(isRetryable(serverDown())).toBe(true);
    expect(isRetryable(rejected())).toBe(false);
    expect(isRetryable(new ApiError(401, "UNAUTHORIZED", "no"))).toBe(false);
  });
});

describe("a 2xx we could not read is a SAVED log, not a queued one", () => {
  // The server accepted the write; only the reply was unreadable — almost
  // always a response shape this build predates. Treating it as a failure told
  // the user their log had not synced while the record sat on the server.
  it("is not retryable", () => {
    expect(isRetryable(new ResponseParseError(200))).toBe(false);
  });

  it("resolves saved and queues nothing", async () => {
    mocks.createProteinLog.mockRejectedValueOnce(new ResponseParseError(201));
    await expect(saveLogDurably("u1", "protein", { grams: 20 })).resolves.toBe("saved");
    expect(await outboxCount("u1")).toBe(0);
  });

  it("never surfaces as an error to the caller", async () => {
    // Throwing here would show a save failure for a log that did save.
    mocks.createProteinLog.mockRejectedValueOnce(new ResponseParseError(200));
    await expect(saveLogDurably("u1", "protein", { grams: 5 })).resolves.toBeDefined();
  });

  it("is still distinct from a 5xx, which DOES queue", async () => {
    mocks.createProteinLog.mockRejectedValueOnce(serverDown());
    await expect(saveLogDurably("u1", "protein", { grams: 9 })).resolves.toBe("queued");
    expect(await outboxCount("u1")).toBe(1);
  });
});

describe("saveLogDurably", () => {
  it("attaches an idempotency key and resolves saved on success", async () => {
    mocks.createProteinLog.mockResolvedValue({});
    const result = await saveLogDurably("u1", "protein", { grams: 30 });
    expect(result).toBe("saved");
    const sent = mocks.createProteinLog.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent.grams).toBe(30);
    expect(typeof sent.idempotencyKey).toBe("string");
    expect(await outboxCount("u1")).toBe(0);
  });

  it("queues on offline instead of losing the log", async () => {
    mocks.createProteinLog.mockRejectedValue(offline());
    const result = await saveLogDurably("u1", "protein", { grams: 30 });
    expect(result).toBe("queued");
    expect(await outboxCount("u1")).toBe(1);
    // The queued payload keeps the SAME key it first tried with, so a retry
    // after a response-lost success dedupes server-side.
    const entry = parseOutbox(mocks.storage.get(outboxKey("u1")) ?? null)[0]!;
    expect(entry.payload.idempotencyKey).toBe(entry.key);
  });

  it("throws a final rejection to the caller and queues nothing", async () => {
    mocks.createProteinLog.mockRejectedValue(rejected());
    await expect(saveLogDurably("u1", "protein", { grams: -5 })).rejects.toBeInstanceOf(ApiError);
    expect(await outboxCount("u1")).toBe(0);
  });

  it("keeps queues strictly per user", async () => {
    mocks.createProteinLog.mockRejectedValue(offline());
    await saveLogDurably("u1", "protein", { grams: 30 });
    expect(await outboxCount("u1")).toBe(1);
    expect(await outboxCount("u2")).toBe(0);
  });
});

describe("replayOutbox", () => {
  async function seedQueue(n: number) {
    mocks.createProteinLog.mockRejectedValue(offline());
    for (let i = 0; i < n; i += 1) {
      await saveLogDurably("u1", "protein", { grams: i + 1 });
    }
    mocks.createProteinLog.mockReset();
  }

  it("sends everything in order once the network heals", async () => {
    await seedQueue(3);
    mocks.createProteinLog.mockResolvedValue({});
    const result = await replayOutbox("u1");
    expect(result).toEqual({ sent: 3, dropped: 0, remaining: 0 });
    const grams = mocks.createProteinLog.mock.calls.map(
      (c) => (c[0] as Record<string, unknown>).grams,
    );
    expect(grams).toEqual([1, 2, 3]);
    expect(await outboxCount("u1")).toBe(0);
  });

  it("stops at a transient failure and keeps the rest, in order", async () => {
    await seedQueue(3);
    mocks.createProteinLog.mockResolvedValueOnce({}).mockRejectedValueOnce(serverDown());
    const result = await replayOutbox("u1");
    expect(result.sent).toBe(1);
    expect(result.remaining).toBe(2);
    const left = parseOutbox(mocks.storage.get(outboxKey("u1")) ?? null);
    expect(left.map((e) => e.payload.grams)).toEqual([2, 3]);
    expect(left[0]!.attempts).toBe(2);
  });

  it("drops a poison entry instead of wedging the queue behind it", async () => {
    await seedQueue(2);
    mocks.createProteinLog.mockRejectedValueOnce(rejected()).mockResolvedValueOnce({});
    const result = await replayOutbox("u1");
    expect(result).toEqual({ sent: 1, dropped: 1, remaining: 0 });
  });

  it("replays with the ORIGINAL idempotency key, so a lost-response retry dedupes", async () => {
    await seedQueue(1);
    const queuedKey = parseOutbox(mocks.storage.get(outboxKey("u1")) ?? null)[0]!.key;
    mocks.createProteinLog.mockResolvedValue({});
    await replayOutbox("u1");
    const sent = mocks.createProteinLog.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent.idempotencyKey).toBe(queuedKey);
  });
});

describe("robustness", () => {
  it("corrupt stored state reads as an empty queue", () => {
    for (const raw of [null, "", "not json", "{}", '"x"', "[1,2]", '[{"key":1}]']) {
      const entries = parseOutbox(raw);
      expect(Array.isArray(entries)).toBe(true);
      expect(entries.every((e) => typeof e.key === "string")).toBe(true);
    }
  });

  it("keys are unique across rapid generation", () => {
    const keys = new Set(Array.from({ length: 500 }, () => makeIdempotencyKey()));
    expect(keys.size).toBe(500);
  });
});

// The three links that turned one malformed payload into total data loss:
// a validation throw misread as "offline", a FIFO that breaks on retryable,
// and no cap on how long one entry may hold the queue.
describe("a payload this build cannot send never blocks the queue", () => {
  function zodLikeError() {
    // Shaped like a real ZodError without importing zod into this test.
    const error = new Error("Unrecognized key(s) in object: 'idempotencyKey'");
    error.name = "ZodError";
    (error as unknown as { issues: unknown[] }).issues = [
      { code: "unrecognized_keys", keys: ["idempotencyKey"] },
    ];
    return error;
  }

  it("classifies a local validation throw as terminal, not as offline", () => {
    // The old rule fell through to `return true` for anything that was not an
    // ApiError — so a synchronous parse failure was queued as if the network
    // had blipped, and retried forever.
    expect(isRetryable(zodLikeError())).toBe(false);
  });

  it("still treats a genuine network failure as retryable", () => {
    expect(isRetryable(new TypeError("Network request failed"))).toBe(true);
  });

  it("throws to the caller instead of queueing an unsendable payload", async () => {
    mocks.createProteinLog.mockRejectedValueOnce(zodLikeError());

    await expect(
      saveLogDurably("user-1", "protein", { grams: 30, datetime: NOW }),
    ).rejects.toThrow(/Unrecognized key/);

    // Nothing queued — the entry that used to sit at the head forever.
    expect(await outboxCount("user-1")).toBe(0);
  });
});

describe("no single entry can hold the queue forever", () => {
  it("drops an entry that has exhausted its attempts and drains the rest", async () => {
    const stuck = {
      key: "poison",
      kind: "weight" as const,
      payload: { value: 182, unit: "lb", datetime: NOW },
      enqueuedAt: NOW,
      attempts: MAX_REPLAY_ATTEMPTS,
    };
    const behind = {
      key: "good",
      kind: "protein" as const,
      payload: { grams: 30, datetime: NOW },
      enqueuedAt: NOW,
      attempts: 0,
    };
    mocks.storage.set(outboxKey("user-1"), JSON.stringify([stuck, behind]));
    mocks.createProteinLog.mockResolvedValueOnce({});

    const result = await replayOutbox("user-1");

    // The log stranded behind the poison entry finally syncs.
    expect(result.dropped).toBe(1);
    expect(result.sent).toBe(1);
    expect(await outboxCount("user-1")).toBe(0);
  });

  it("drops an entry too old to be worth sending", async () => {
    const ancient = {
      key: "ancient",
      kind: "water" as const,
      payload: { amountOz: 8, datetime: NOW },
      // Unambiguously past the age bound, whatever the wall clock says.
      enqueuedAt: "2020-01-01T00:00:00.000Z",
      attempts: 0,
    };
    mocks.storage.set(outboxKey("user-1"), JSON.stringify([ancient]));

    const result = await replayOutbox("user-1");

    expect(result.dropped).toBe(1);
    expect(await outboxCount("user-1")).toBe(0);
  });

  it("leaves a healthy entry alone", async () => {
    const fresh = {
      key: "fresh",
      kind: "protein" as const,
      payload: { grams: 30, datetime: NOW },
      enqueuedAt: NOW,
      attempts: 1,
    };
    expect(isDeadEntry(fresh, Date.parse(NOW))).toBe(false);
  });

  it("recovers a previously stuck weight entry now that the payload validates", async () => {
    // Exactly what a device upgrading from the broken build is holding.
    const stuckWeight = {
      key: "weight-stuck",
      kind: "weight" as const,
      payload: { value: 182, unit: "lb", datetime: NOW, idempotencyKey: "weight-stuck" },
      enqueuedAt: NOW,
      attempts: 3,
    };
    mocks.storage.set(outboxKey("user-1"), JSON.stringify([stuckWeight]));

    const result = await replayOutbox("user-1");

    // Not dropped — SENT. The user's weigh-in is recovered, not discarded.
    expect(result.sent).toBe(1);
    expect(result.dropped).toBe(0);
  });
});
