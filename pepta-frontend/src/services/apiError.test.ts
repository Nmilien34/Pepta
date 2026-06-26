import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "@pepta/shared";
import { ApiError, extractApiError, isApiErrorCode, isOffline } from "./apiError";

describe("extractApiError", () => {
  it("uses the ApiError's backend code when present", () => {
    expect(extractApiError(new ApiError(403, "Upgrade required", ERROR_CODES.forbidden))).toEqual({
      code: ERROR_CODES.forbidden,
      message: "Upgrade required",
    });
  });

  it("derives a code from the HTTP status when the envelope had none", () => {
    expect(extractApiError(new ApiError(404, "missing")).code).toBe(ERROR_CODES.notFound);
    expect(extractApiError(new ApiError(429, "slow down")).code).toBe(ERROR_CODES.rateLimited);
  });

  it("maps a network failure to serviceUnavailable (offline)", () => {
    const networkErr = new TypeError("Network request failed");
    expect(extractApiError(networkErr).code).toBe(ERROR_CODES.serviceUnavailable);
    expect(isOffline(networkErr)).toBe(true);
  });

  it("maps a timeout (AbortError) to serviceUnavailable", () => {
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    expect(extractApiError(aborted).code).toBe(ERROR_CODES.serviceUnavailable);
  });

  it("falls back to internal for unknown values", () => {
    expect(extractApiError("weird").code).toBe(ERROR_CODES.internal);
  });
});

describe("isApiErrorCode", () => {
  it("guards on the specific code", () => {
    const err = new ApiError(403, "no", ERROR_CODES.forbidden);
    expect(isApiErrorCode(err, ERROR_CODES.forbidden)).toBe(true);
    expect(isApiErrorCode(err, ERROR_CODES.notFound)).toBe(false);
  });
});
