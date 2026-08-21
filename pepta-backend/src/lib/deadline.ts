// Deadlines for optional work.
//
// The OpenAI SDK's own `timeout` bounds a single attempt, not the call: it
// retries, so a "5s timeout" can still occupy 15s or more of wall clock. That
// is fine for an endpoint whose whole job is the model, and wrong for a screen
// that merely garnishes real data with model prose — there, the AI is the
// least important part of the payload and must never be the reason the screen
// fails to load.
//
// The app aborts its own requests well before a retrying SDK gives up, so
// without a server-side deadline the user sees a network error instead of
// their data.

/**
 * Resolves to `fallback` if `work` has not settled within `ms`.
 *
 * The underlying promise is NOT cancelled — it is left to finish or fail on
 * its own, and its result is discarded. That is deliberate for the callers
 * here: the work is a cache-populating side effect, so letting it complete in
 * the background means the next request can use what this one gave up on.
 * A rejection after the deadline is swallowed rather than surfacing as an
 * unhandled rejection.
 */
export function withDeadline<T>(
  work: Promise<T>,
  ms: number,
  fallback: T,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      onTimeout?.();
      resolve(fallback);
    }, ms);
    // Never hold the process open for a deadline alone.
    timer.unref?.();

    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
