// Two limiters on one mount must not share a counter.
//
// The key used to be mount + principal, so every limiter under /meal-scans
// incremented the same number regardless of how it was configured. The
// typeahead food search therefore spent the camera's allowance: search a few
// foods, then take a meal photo and get "Couldn't analyze that photo" — with
// Try again blocked too.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInMemoryRateLimiter,
  resetRateLimitStore,
} from "../../middleware/rate-limit.middleware";

interface FakeRequest {
  baseUrl: string;
  ip?: string;
  user?: { id: string };
}

function run(
  limiter: ReturnType<typeof createInMemoryRateLimiter>,
  req: FakeRequest,
): "passed" | "limited" {
  let outcome: "passed" | "limited" = "passed";
  const res = { setHeader: vi.fn() };
  limiter(req as never, res as never, ((error?: unknown) => {
    if (error) outcome = "limited";
  }) as never);
  return outcome;
}

const user: FakeRequest = { baseUrl: "/meal-scans", user: { id: "user-1" } };

beforeEach(() => {
  resetRateLimitStore();
});

describe("rate limiter buckets", () => {
  it("keeps separate counters for separate buckets on the same mount", () => {
    const scan = createInMemoryRateLimiter({
      windowMs: 60_000,
      maxRequests: 2,
      keyBy: "userOrIp",
      bucket: "scan",
    });
    const search = createInMemoryRateLimiter({
      windowMs: 60_000,
      maxRequests: 2,
      keyBy: "userOrIp",
      bucket: "food-search",
    });

    // Exhaust the search budget entirely.
    expect(run(search, user)).toBe("passed");
    expect(run(search, user)).toBe("passed");
    expect(run(search, user)).toBe("limited");

    // The camera is untouched by that.
    expect(run(scan, user)).toBe("passed");
    expect(run(scan, user)).toBe("passed");
    expect(run(scan, user)).toBe("limited");
  });

  it("still shares a counter within one bucket", () => {
    const limiter = createInMemoryRateLimiter({
      windowMs: 60_000,
      maxRequests: 1,
      keyBy: "userOrIp",
      bucket: "scan",
    });

    expect(run(limiter, user)).toBe("passed");
    expect(run(limiter, user)).toBe("limited");
  });

  it("keeps one user's budget away from another's", () => {
    const limiter = createInMemoryRateLimiter({
      windowMs: 60_000,
      maxRequests: 1,
      keyBy: "userOrIp",
      bucket: "scan",
    });

    expect(run(limiter, user)).toBe("passed");
    expect(run(limiter, { baseUrl: "/meal-scans", user: { id: "user-2" } })).toBe(
      "passed",
    );
  });
});
