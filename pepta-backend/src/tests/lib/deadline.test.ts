// Deadlines exist so optional AI work can never be the reason a screen fails
// to load. The OpenAI SDK's own timeout bounds one attempt and it retries, so
// a "5s timeout" can still occupy far longer than the app's request abort.

import { describe, expect, it, vi } from "vitest";
import { withDeadline } from "../../lib/deadline";

describe("withDeadline", () => {
  it("returns the real value when the work finishes in time", async () => {
    await expect(withDeadline(Promise.resolve("real"), 50, "fallback")).resolves.toBe(
      "real",
    );
  });

  it("returns the fallback when the work is too slow", async () => {
    vi.useFakeTimers();
    try {
      const slow = new Promise<string>((resolve) => setTimeout(() => resolve("late"), 10_000));
      const result = withDeadline(slow, 100, "fallback");
      await vi.advanceTimersByTimeAsync(150);

      await expect(result).resolves.toBe("fallback");
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns the fallback when the work rejects", async () => {
    await expect(
      withDeadline(Promise.reject(new Error("openai down")), 50, "fallback"),
    ).resolves.toBe("fallback");
  });

  it("reports the timeout so it is visible in the logs", async () => {
    vi.useFakeTimers();
    try {
      const onTimeout = vi.fn();
      const never = new Promise<string>(() => undefined);
      const result = withDeadline(never, 100, "fallback", onTimeout);
      await vi.advanceTimersByTimeAsync(150);
      await result;

      expect(onTimeout).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("swallows a rejection that lands AFTER the deadline", async () => {
    vi.useFakeTimers();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      let fail!: (error: Error) => void;
      const late = new Promise<string>((_resolve, reject) => {
        fail = reject;
      });
      const result = withDeadline(late, 50, "fallback");
      await vi.advanceTimersByTimeAsync(100);
      await expect(result).resolves.toBe("fallback");

      // The abandoned work fails later; that must not crash the process.
      fail(new Error("too late"));
      await vi.advanceTimersByTimeAsync(10);
      await Promise.resolve();

      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
      vi.useRealTimers();
    }
  });

  it("does not resolve twice when the work lands right on the deadline", async () => {
    vi.useFakeTimers();
    try {
      const onTimeout = vi.fn();
      const work = new Promise<string>((resolve) => setTimeout(() => resolve("real"), 100));
      const result = withDeadline(work, 100, "fallback", onTimeout);
      await vi.advanceTimersByTimeAsync(200);

      // Whichever won, exactly one outcome is delivered.
      await expect(result).resolves.toMatch(/^(real|fallback)$/);
      expect(onTimeout.mock.calls.length).toBeLessThanOrEqual(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
