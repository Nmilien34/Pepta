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
  outboxCount,
  outboxKey,
  parseOutbox,
  replayOutbox,
  saveLogDurably,
} from "./mutationOutbox";

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
