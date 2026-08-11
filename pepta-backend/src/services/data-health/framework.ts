/**
 * DATA HEALTH — the app noticing a user's own records are incomplete or
 * contradictory, and asking them to fix it once.
 *
 * A detector is a named predicate over one user's data. It returns nothing, or
 * the facts for a card. The registry order IS the priority order. At most one
 * card is ever returned, so a user with three problems is asked about the worst
 * one and sees the next on a LATER visit — never handed a queue of chores.
 *
 * This is a maintenance channel, not an engagement channel. No modals, no
 * scheduling, no server-driven copy. Copy lives in the app so wording is an OTA.
 *
 * Adding a detector: write a detect() function, add one entry to DETECTORS, add
 * one variant to dataHealthCardSchema, and one copy block in the client. That
 * is the whole cost, and it is meant to stay that way.
 */

import { createHash } from "node:crypto";
import type { DataHealthCard } from "@pepta/shared";

export interface DataHealthCompound {
  id: string;
  name: string;
  route: string | null;
  plannedDose: number | null;
  doseUnit: string;
  createdAt: Date;
  halfLifeDays: number | null;
}

export interface DataHealthSchedule {
  id: string;
  compoundId: string;
  frequency: string;
  timesOfDay: string[];
  daysOfWeek: number[];
}

/** Everything every detector is allowed to see. Loaded once per request. */
export interface DataHealthContext {
  compounds: DataHealthCompound[];
  schedules: DataHealthSchedule[];
  /** compoundId → count of NON-deleted dose logs. */
  doseCounts: Map<string, number>;
}

export interface DetectorHit {
  /** Stable id of the thing the card is about — the middle key segment. */
  subjectId: string;
  /**
   * Everything the card is "about". Any change here yields a different key,
   * which no dismissal row matches, so the card re-fires on its own. This is
   * the entire implementation of "dismissed until the facts change".
   */
  facts: string[];
  card(key: string): DataHealthCard;
}

export interface Detector {
  name: string;
  detect(context: DataHealthContext): DetectorHit | null;
}

/** "<detector>:<subjectId>:<factHash>" — see nudgeKeySchema. */
export function dataHealthKey(
  detector: string,
  subjectId: string,
  facts: string[],
): string {
  const hash = createHash("sha256")
    .update(facts.join("|"))
    .digest("hex")
    .slice(0, 12);
  return `${detector}:${subjectId}:${hash}`;
}

/** Trim, lowercase, collapse runs of whitespace. Used for duplicate matching. */
export function normalizeCompoundName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function liveDoseCount(
  context: DataHealthContext,
  compoundId: string,
): number {
  return context.doseCounts.get(compoundId) ?? 0;
}

/**
 * First unresolved card by priority, or null.
 *
 * Detectors run against freshly loaded data every call, which is why the
 * D1-resolves-D2 case needs no special handling: once a merge deactivates the
 * timeless schedule, D2 simply has nothing left to match.
 */
export function firstUnresolvedCard(
  detectors: Detector[],
  context: DataHealthContext,
  dismissedKeys: Iterable<string>,
): DataHealthCard | null {
  const dismissed = new Set(dismissedKeys);

  for (const detector of detectors) {
    const hit = detector.detect(context);
    if (!hit) continue;
    const key = dataHealthKey(detector.name, hit.subjectId, hit.facts);
    if (dismissed.has(key)) continue;
    return hit.card(key);
  }

  return null;
}
