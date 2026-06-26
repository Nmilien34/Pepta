// Typed error handling, mirroring Leanient's apiError.ts. The backend always
// replies with `{ error: { code, message, details? } }` (apiErrorResponseSchema);
// the api client throws an `ApiError` carrying that `code`. Screens/contexts
// branch on `error.code` (e.g. forbidden → paywall, network → "check connection")
// instead of string-matching message text, which is brittle.

import { ERROR_CODES } from "@pepta/shared";

// Thrown by the api client. `status` is the HTTP status; `code` is the backend's
// semantic ERROR_CODES value when the response carried an error envelope.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function statusToCode(status: number): string {
  switch (status) {
    case 400:
      return ERROR_CODES.badRequest;
    case 401:
      return ERROR_CODES.authInvalidToken;
    case 403:
      return ERROR_CODES.forbidden;
    case 404:
      return ERROR_CODES.notFound;
    case 409:
      return ERROR_CODES.conflict;
    case 429:
      return ERROR_CODES.rateLimited;
    case 503:
      return ERROR_CODES.serviceUnavailable;
    default:
      return ERROR_CODES.internal;
  }
}

// Normalize any thrown value into a typed `{ code, message }`. Network drops and
// timeouts (which never reach an error envelope) map to serviceUnavailable so
// callers can show a "check your connection" message.
export function extractApiError(error: unknown): { code: string; message: string } {
  if (error instanceof ApiError) {
    return { code: error.code ?? statusToCode(error.status), message: error.message };
  }
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return { code: ERROR_CODES.serviceUnavailable, message: "The request timed out." };
    }
    if (error.name === "TypeError" || /network request failed|fetch/i.test(error.message)) {
      return { code: ERROR_CODES.serviceUnavailable, message: "Network request failed." };
    }
    return { code: ERROR_CODES.internal, message: error.message };
  }
  return { code: ERROR_CODES.internal, message: "Something went wrong. Please try again." };
}

// Convenience guard for branching UI on a specific backend error code, e.g.
// `if (isApiErrorCode(err, ERROR_CODES.forbidden)) showPaywall()`.
export function isApiErrorCode(error: unknown, code: string): boolean {
  return extractApiError(error).code === code;
}

// True for connectivity problems (timeout / network drop / service unavailable).
export function isOffline(error: unknown): boolean {
  return extractApiError(error).code === ERROR_CODES.serviceUnavailable;
}
