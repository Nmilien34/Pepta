// Self-maintaining app-update config. The latest App Store version is
// discovered at request time from Apple's iTunes Lookup API — never a
// hardcoded literal — so shipping a release automatically starts prompting
// older installs with zero config changes. Env vars (see config/env.ts,
// PEPTA_*) only override.
//
// Availability contract: this feeds a public pre-auth endpoint hit on every
// cold launch. It must NEVER throw and never block startup — Apple failures
// degrade to the last known good value, and with no value at all the client
// is told to show nothing (latestVersion: null).

import { env } from '../config/env';
import { logger } from '../lib/logger';

// Must match pepta-frontend/app.config.js `ios.bundleIdentifier`; the
// app-version hygiene test asserts the two never drift.
export const PEPTA_BUNDLE_ID = 'ai.boltzman.peptaapp';
export const PEPTA_APP_STORE_ID = '6784368155';
const STORE_URL = `https://apps.apple.com/app/id${PEPTA_APP_STORE_ID}`;
const LOOKUP_URL = `https://itunes.apple.com/lookup?bundleId=${PEPTA_BUNDLE_ID}`;

const CACHE_TTL_MS = 60 * 60 * 1000; // ~1h between Apple hits
const LOOKUP_TIMEOUT_MS = 4_000;

export interface AppVersionResponse {
  latestVersion: string | null;
  minimumVersion: string | null;
  forceUpdate: boolean;
  title: string;
  message: string;
  storeUrl: string;
  source: 'apple' | 'override' | 'cache';
}

interface AppUpdateOverrides {
  minimumVersion: string | null;
  forceUpdate: boolean;
  title: string | null;
  message: string | null;
  latestVersionOverride: string | null;
}

interface AppVersionServiceOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  getOverrides?: () => AppUpdateOverrides;
  ttlMs?: number;
  timeoutMs?: number;
}

const DEFAULT_TITLE = 'Update available';
const DEFAULT_MESSAGE =
  'A new version of Pepta is ready. Update to get the latest improvements.';

function parseLookupVersion(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const first = results[0] as { version?: unknown; bundleId?: unknown };
  // Belt and braces: the lookup is already keyed by bundle id, but if Apple
  // ever returns a different app, its version must not be served as ours.
  if (typeof first.bundleId === 'string' && first.bundleId !== PEPTA_BUNDLE_ID) {
    return null;
  }
  return typeof first.version === 'string' && first.version.length > 0
    ? first.version
    : null;
}

export function createAppVersionService(options: AppVersionServiceOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const getOverrides = options.getOverrides ?? (() => env.appUpdate);
  const ttlMs = options.ttlMs ?? CACHE_TTL_MS;
  const timeoutMs = options.timeoutMs ?? LOOKUP_TIMEOUT_MS;

  // Last known good Apple answer. `fetchedAt` drives the TTL; the value
  // itself is kept indefinitely so outages serve stale rather than nothing.
  let lastGood: { version: string; fetchedAt: number } | null = null;
  let inFlight: Promise<string | null> | null = null;

  async function lookupAppleVersion(): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // The `t` param busts Apple's CDN cache (observed ~3.6h max-age, with
      // reports of much longer): without it, a release can take hours longer
      // to start prompting. Our own 1h TTL is the real rate limit.
      const response = await fetchImpl(`${LOOKUP_URL}&t=${now()}`, {
        signal: controller.signal,
      });
      if (!response.ok) return null;
      return parseLookupVersion(await response.json());
    } catch (error) {
      logger.warn({ error: String(error) }, '[app-version] iTunes lookup failed');
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function resolveAppleVersion(): Promise<{
    version: string | null;
    source: 'apple' | 'cache';
  }> {
    if (lastGood && now() - lastGood.fetchedAt < ttlMs) {
      return { version: lastGood.version, source: 'apple' };
    }
    // Dedupe concurrent cold-launch requests into one Apple hit.
    inFlight ??= lookupAppleVersion().finally(() => {
      inFlight = null;
    });
    const fresh = await inFlight;
    if (fresh) {
      lastGood = { version: fresh, fetchedAt: now() };
      return { version: fresh, source: 'apple' };
    }
    // Apple failed or timed out: serve the last known good value, however
    // old. With no cache at all, null tells the client to show nothing.
    return { version: lastGood?.version ?? null, source: 'cache' };
  }

  async function getVersionConfig(): Promise<AppVersionResponse> {
    const overrides = getOverrides();
    let latestVersion: string | null;
    let source: AppVersionResponse['source'];
    if (overrides.latestVersionOverride) {
      latestVersion = overrides.latestVersionOverride;
      source = 'override';
    } else {
      ({ version: latestVersion, source } = await resolveAppleVersion());
    }
    return {
      latestVersion,
      minimumVersion: overrides.minimumVersion,
      forceUpdate: overrides.forceUpdate,
      title: overrides.title ?? DEFAULT_TITLE,
      message: overrides.message ?? DEFAULT_MESSAGE,
      storeUrl: STORE_URL,
      source,
    };
  }

  return { getVersionConfig };
}

export type AppVersionService = ReturnType<typeof createAppVersionService>;

export const appVersionService = createAppVersionService();
