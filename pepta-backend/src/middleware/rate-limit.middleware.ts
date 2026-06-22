import type { RequestHandler } from "express";
import { ERROR_CODES } from "@pepta/shared";
import { AppError } from "../lib/errors";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface InMemoryRateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  keyBy?: "ip" | "userOrIp";
}

const store = new Map<string, RateLimitEntry>();

const cleanupInterval = setInterval(() => {
  const now = Date.now();

  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}, 60_000);

cleanupInterval.unref();

export function resetRateLimitStore(): void {
  store.clear();
}

export function createInMemoryRateLimiter(
  options: InMemoryRateLimiterOptions,
): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    const principal =
      options.keyBy === "userOrIp" && req.user?.id
        ? `user:${req.user.id}`
        : `ip:${req.ip ?? "unknown"}`;
    const key = `${req.baseUrl}:${principal}`;
    const current = store.get(key);

    if (!current || current.resetAt <= now) {
      store.set(key, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      next();
      return;
    }

    current.count += 1;

    if (current.count > options.maxRequests) {
      const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      next(
        new AppError({
          code: ERROR_CODES.rateLimited,
          message: options.message ?? "Too many requests",
          statusCode: 429,
        }),
      );
      return;
    }

    next();
  };
}
