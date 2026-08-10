// The medication catalog, with the backend as the source of truth for
// CLINICAL values and the bundled list as presentation + offline fallback.
//
// WHY A MERGE RATHER THAN A REPLACEMENT (approved 2026-08-11): the server
// catalog carries no presentation (subtitle, icon kind, tint) and — critically
// — no `routeAmbiguous`, which is what decides whether onboarding asks the
// route question at all. It also has no Saxenda/Victoza row and no
// "Something else" row, the latter being the doorway to the custom-medication
// form. A straight swap would delete real medications, drop the custom-entry
// path, and silently change onboarding gating. So: server wins on
// halfLifeDays / commonDoses / route / doseUnit, the bundle owns everything
// else, and bundle-only entries survive untouched.
//
// STALENESS STRATEGY: stale-while-revalidate on a 24h TTL.
//   · Reads NEVER block: callers get the cache (or the bundle) synchronously.
//   · A refresh runs on app launch when the cache is missing or older than
//     24h. Clinical constants change on the timescale of label revisions —
//     years — so a day of staleness costs nothing, while a correction still
//     reaches every user within a day without polling the endpoint.
//   · Any failure (offline, 404, malformed) leaves the last good cache in
//     place; with no cache at all, the bundled list serves. The picker is
//     never empty and never blocks on the network.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MedicationCatalogItem } from '@pepta/shared';
import { MEDICATION_CATALOG, type MedicationOption } from '../data/medicationCatalog';
import { api } from './api';

const CACHE_KEY = 'pepta.medicationCatalog.v1';
export const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedCatalog {
  fetchedAt: string;
  items: MedicationCatalogItem[];
}

/** Bundled ids use underscores, server slugs use hyphens. */
export function slugForOption(option: MedicationOption): string {
  return option.id.replace(/_/g, '-');
}

/**
 * Server clinical values over bundled presentation. Bundle-only entries are
 * kept as-is; server-only entries are ignored — they'd have no subtitle,
 * icon, or routeAmbiguous flag, so rendering them would look broken and
 * could mis-gate the route question. (Lift that once the server catalog
 * carries presentation.)
 */
export function mergeCatalog(
  bundled: readonly MedicationOption[],
  serverItems: readonly MedicationCatalogItem[],
): MedicationOption[] {
  const bySlug = new Map(serverItems.map((item) => [item.slug, item]));
  return bundled.map((option) => {
    const server = bySlug.get(slugForOption(option));
    if (!server) return option;
    return {
      ...option,
      halfLifeDays: server.halfLifeDays ?? null,
      route: server.route,
      doseUnit: server.doseUnit,
      // An empty server list means "no suggested doses"; keep the bundled
      // chips rather than rendering a dose step with nothing to tap.
      commonDoses: server.commonDoses.length > 0 ? server.commonDoses : option.commonDoses,
    };
  });
}

// Module-level so every consumer reads the same list within a session.
let current: MedicationOption[] = [...MEDICATION_CATALOG];
let hydrated = false;
let inFlight: Promise<void> | null = null;

/** Synchronous — safe to render from. Bundled until a cache/fetch lands. */
export function currentMedicationCatalog(): MedicationOption[] {
  return current;
}

function isFresh(cache: CachedCatalog, now: number): boolean {
  const at = new Date(cache.fetchedAt).getTime();
  return Number.isFinite(at) && now - at < CATALOG_TTL_MS;
}

async function readCache(): Promise<CachedCatalog | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCatalog;
    return Array.isArray(parsed?.items) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Hydrate from cache, then refresh if stale. Resolves once `current` is the
 * best list available; never throws, never leaves the catalog empty.
 */
export async function loadMedicationCatalog(now: number = Date.now()): Promise<MedicationOption[]> {
  if (inFlight) {
    await inFlight;
    return current;
  }
  const run = (async () => {
    const cache = await readCache();
    if (cache && cache.items.length > 0) {
      current = mergeCatalog(MEDICATION_CATALOG, cache.items);
      hydrated = true;
      if (isFresh(cache, now)) return;
    }
    try {
      const items = await api.listMedicationCatalog();
      // An empty server catalog (unseeded) must not blank the picker.
      if (items.length === 0) return;
      current = mergeCatalog(MEDICATION_CATALOG, items);
      hydrated = true;
      await AsyncStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ fetchedAt: new Date(now).toISOString(), items } satisfies CachedCatalog),
      ).catch(() => undefined);
    } catch {
      // Offline / 404 / malformed: keep whatever we already have.
    }
  })();
  inFlight = run;
  try {
    await run;
  } finally {
    inFlight = null;
  }
  return current;
}

/** Test seam. */
export function resetMedicationCatalogForTests(): void {
  current = [...MEDICATION_CATALOG];
  hydrated = false;
  inFlight = null;
}

export function isMedicationCatalogHydrated(): boolean {
  return hydrated;
}
