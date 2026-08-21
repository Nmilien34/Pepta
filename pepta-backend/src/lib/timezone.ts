// Minimal IANA timezone math (no deps) for protocol dose times. Schedule
// times are user-local wall clock ("22:00 before bed"); projections need the
// exact UTC instant of that wall time on a given calendar day in the user's
// zone — including across DST shifts. Standard two-pass offset technique via
// Intl.DateTimeFormat.

// KEYED ON THE CANONICAL ZONE, AND BOUNDED.
//
// Intl accepts any casing of a valid zone — "america/new_york",
// "AMERICA/NEW_YORK", "AmErIcA/nEw_YoRk" all resolve to the same place. Keyed
// on the raw request string, each spelling became its own permanent entry
// holding an ICU formatter, so one authenticated client looping
// GET /home?tz=<random casing> grew the server's heap without bound. There are
// thousands of spellings of a single real zone.
//
// resolvedOptions().timeZone gives the canonical IANA name, so every spelling
// now collapses onto one entry. The size cap is belt and braces: the real
// world has a few hundred zones, so passing this bound means something is
// wrong rather than something is busy.
const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();
const MAX_CACHED_FORMATTERS = 600;

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = partsFormatterCache.get(timeZone);
  if (cached) return cached;

  // Throws for an unusable zone, before anything is cached.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const canonical = formatter.resolvedOptions().timeZone;
  const existing = partsFormatterCache.get(canonical);
  if (existing) return existing;

  if (partsFormatterCache.size >= MAX_CACHED_FORMATTERS) {
    // Drop the oldest rather than growing. Map preserves insertion order.
    const oldest = partsFormatterCache.keys().next();
    if (!oldest.done) partsFormatterCache.delete(oldest.value);
  }
  partsFormatterCache.set(canonical, formatter);
  return formatter;
}

/** Test seam: the number of distinct formatters currently held. */
export function cachedFormatterCountForTests(): number {
  return partsFormatterCache.size;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    partsFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Milliseconds the zone is ahead of UTC at the given instant. */
function tzOffsetAt(utcMs: number, timeZone: string): number {
  const parts = partsFormatter(timeZone).formatToParts(new Date(utcMs));
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  // Intl renders midnight as hour "24" in some engines — normalize.
  const hour = get("hour") % 24;
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * UTC instant of `dateOnly` (YYYY-MM-DD) at `timeOfDay` (HH:MM) in the zone.
 * Two passes handle DST boundaries; nonexistent wall times (spring-forward
 * gap) resolve to the shifted instant, matching user expectation.
 */
export function zonedTimeToUtc(
  dateOnly: string,
  timeOfDay: string,
  timeZone: string,
): Date {
  const [y, m, d] = dateOnly.split("-").map(Number);
  const [hh, mm] = timeOfDay.split(":").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, hh!, mm!);
  const first = guess - tzOffsetAt(guess, timeZone);
  const second = guess - tzOffsetAt(first, timeZone);
  return new Date(second);
}

/** Calendar date (YYYY-MM-DD) the instant falls on in the zone. */
export function dateOnlyInTz(at: Date, timeZone: string): string {
  const parts = partsFormatter(timeZone).formatToParts(at);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Hour of day (0-23) the instant falls on in the zone. */
export function hourInTz(at: Date, timeZone: string): number {
  const parts = partsFormatter(timeZone).formatToParts(at);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "0";
  // hourCycle h23 keeps midnight as 0 rather than 24.
  return Number.parseInt(hour, 10) % 24;
}

/** Day-of-week (0 = Sunday) for a date-only string — timezone-free math. */
export function dayOfWeekOf(dateOnly: string): number {
  const [y, m, d] = dateOnly.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

/** Whole-day difference b − a for date-only strings. */
export function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(by!, bm! - 1, bd!) - Date.UTC(ay!, am! - 1, ad!)) / 86_400_000,
  );
}

/** dateOnly + n days, as date-only. */
export function addDaysDateOnly(dateOnly: string, days: number): string {
  const [y, m, d] = dateOnly.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}
