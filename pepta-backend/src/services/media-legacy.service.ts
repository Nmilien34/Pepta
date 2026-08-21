// Legacy raw-key media: discovery and registration.
//
// Before the media pipeline, five collections stored raw S3 keys. This branch
// removed those fields from the schemas, which created a hole: nothing could
// even DISCOVER the historical objects, so account deletion silently orphaned
// them and no cleanup authority existed. This module is the bridge — it reads
// the raw fields off the live documents and registers them as MediaAssets.
//
// TWO RULES EVERYTHING HERE OBEYS:
//
// 1. NATIVE DRIVER READS ONLY. mongoose runs strictQuery:true (db/mongo.ts),
//    which silently STRIPS filter paths the schema no longer declares —
//    Model.find({ photoS3Key: { $exists: true } }) degrades to find({}) and
//    matches every document. Model.collection.* bypasses the schema, so the
//    filters here mean what they say.
//
// 2. OWNERSHIP BY PREFIX, ALWAYS. meallogs.photoS3Key was client-supplied
//    with only min-length validation at the time, so a stored value can name
//    another user's object or arbitrary garbage. A key only earns
//    registration when it sits under the exact per-collection prefix for the
//    row's own user; everything else is counted and reported, never acted on.
//    Deleting an unverified key could destroy another user's data.

import { Types } from "mongoose";
import { logger } from "../lib/logger";
import {
  FavouriteModel,
  MealLogModel,
  MealScanModel,
  ProgressPhotoModel,
  UserModel,
} from "../models";
import {
  MediaAssetModel,
  type MediaIntent,
  type MediaLinkKind,
} from "../models/media-asset.model";

export interface LegacyMediaRef {
  /** Which legacy field produced this reference. */
  source: LegacySourceName;
  /** The product document holding the raw key. */
  documentId: string;
  userId: string;
  key: string;
  /** True when the key sits under this user's own prefix for this source. */
  conforming: boolean;
  /** Extra state the reconcile CLI needs (e.g. legacy progress status). */
  legacyStatus?: string;
}

export type LegacySourceName =
  | "favourites.photoS3Key"
  | "meallogs.photoS3Key"
  | "mealscans.photoS3Key"
  | "users.avatarKey"
  | "progressphotos.s3Key";

interface LegacySourceSpec {
  name: LegacySourceName;
  intent: MediaIntent;
  /**
   * The link this source contributes to the asset, or null when the source is
   * a mere referrer whose disappearance must not free the object.
   *
   * A link is a claim on the object's LIFETIME, and it is only honest when
   * some code path detaches it again. Meal scans have no such path — deleting
   * a meal log detaches `meal_log` + the LOG's id (meal-log.service.ts), and
   * nothing anywhere detaches a scan — so a scan link would pin the asset
   * above zero links forever and the object could never be reaped.
   */
  linkKind: MediaLinkKind | null;
  /** Field on the product document that should point at the MediaAsset. */
  mediaIdField: string;
  legacyField: string;
  /** Field marking a soft-deleted row, when the collection has one. */
  softDeleteField?: string;
  prefix(userId: string): string;
}

/**
 * The five legacy fields and where their keys are allowed to live. Favourites
 * is the odd one out — its keys were written WITHOUT the pepta/ namespace, so
 * any scan scoped to pepta/ misses every favourite photo.
 *
 * ORDER MATTERS: meal logs come before meal scans because the two can share
 * one object, and the log is the referrer that owns its lifetime.
 */
export const LEGACY_SOURCES: readonly LegacySourceSpec[] = [
  {
    name: "favourites.photoS3Key",
    intent: "favourite_photo",
    linkKind: "favourite",
    mediaIdField: "photoMediaId",
    legacyField: "photoS3Key",
    prefix: (userId) => `favourites/${userId}/`,
  },
  {
    name: "meallogs.photoS3Key",
    intent: "meal_photo",
    linkKind: "meal_log",
    mediaIdField: "photoMediaId",
    legacyField: "photoS3Key",
    // Meal logs are soft-deleted (deletedAt). The native reads below bypass
    // the deletedAt:null query middleware, so this has to be handled here or
    // reconcile would re-link photos of logs the user already deleted.
    softDeleteField: "deletedAt",
    prefix: (userId) => `pepta/meal-scans/${userId}/`,
  },
  {
    name: "mealscans.photoS3Key",
    intent: "meal_photo",
    // Deliberately linkless — see LegacySourceSpec.linkKind. A scan-only key
    // is registered unattached with the meal TTL and ages out on its own.
    linkKind: null,
    mediaIdField: "photoMediaId",
    legacyField: "photoS3Key",
    prefix: (userId) => `pepta/meal-scans/${userId}/`,
  },
  {
    name: "users.avatarKey",
    intent: "avatar",
    linkKind: "avatar",
    mediaIdField: "avatarMediaId",
    legacyField: "avatarKey",
    prefix: (userId) => `pepta/avatars/${userId}/`,
  },
  {
    name: "progressphotos.s3Key",
    intent: "progress_photo",
    linkKind: "progress_photo",
    mediaIdField: "mediaId",
    legacyField: "s3Key",
    prefix: (userId) => `pepta/progress-photos/${userId}/`,
  },
];

export function legacySpecFor(name: LegacySourceName): LegacySourceSpec {
  return specFor(name);
}

function specFor(name: LegacySourceName): LegacySourceSpec {
  const spec = LEGACY_SOURCES.find((candidate) => candidate.name === name);
  if (!spec) throw new Error(`Unknown legacy source ${name}`);
  return spec;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * Every legacy raw-key reference for one user, straight off the driver.
 *
 * DELIBERATELY BLIND TO THE MEDIA POINTER. A set pointer does NOT mean the
 * raw key is dead: replacing a photo through the pipeline writes the new
 * pointer but never clears the old raw field, so a migrated-looking row can
 * still be the only record of a historical object. Filtering those out here
 * would let exactly those objects outlive the account that owned them.
 * Registration dedupes by storageKey, so a key an asset already tracks costs
 * one lookup and nothing else.
 */
export async function scanLegacyMediaRefs(userId: string): Promise<LegacyMediaRef[]> {
  const owner = new Types.ObjectId(userId);
  const refs: LegacyMediaRef[] = [];

  const push = (
    name: LegacySourceName,
    documentId: unknown,
    key: string | null,
    legacyStatus?: string,
  ) => {
    if (!key) return;
    const spec = specFor(name);
    refs.push({
      source: name,
      documentId: String(documentId),
      userId,
      key,
      conforming: key.startsWith(spec.prefix(userId)),
      ...(legacyStatus ? { legacyStatus } : {}),
    });
  };

  const legacyFilter = (field: string) => ({
    userId: owner,
    [field]: { $exists: true, $type: "string" as const, $ne: "" },
  });

  const [favourites, mealLogs, mealScans, user, progressPhotos] = await Promise.all([
    FavouriteModel.collection
      .find(legacyFilter("photoS3Key"))
      .project({ photoS3Key: 1 })
      .toArray(),
    MealLogModel.collection
      .find(legacyFilter("photoS3Key"))
      .project({ photoS3Key: 1 })
      .toArray(),
    MealScanModel.collection
      .find(legacyFilter("photoS3Key"))
      .project({ photoS3Key: 1 })
      .toArray(),
    UserModel.collection.findOne(
      { _id: owner, avatarKey: { $exists: true, $type: "string", $ne: "" } },
      { projection: { avatarKey: 1 } },
    ),
    ProgressPhotoModel.collection
      .find(legacyFilter("s3Key"))
      .project({ s3Key: 1, status: 1 })
      .toArray(),
  ]);

  for (const row of favourites) push("favourites.photoS3Key", row._id, stringOrNull(row.photoS3Key));
  for (const row of mealLogs) push("meallogs.photoS3Key", row._id, stringOrNull(row.photoS3Key));
  for (const row of mealScans) push("mealscans.photoS3Key", row._id, stringOrNull(row.photoS3Key));
  if (user) push("users.avatarKey", user._id, stringOrNull(user.avatarKey));
  for (const row of progressPhotos) {
    push(
      "progressphotos.s3Key",
      row._id,
      stringOrNull(row.s3Key),
      typeof row.status === "string" ? row.status : undefined,
    );
  }

  return refs;
}

/**
 * Registers one legacy key for deletion, idempotently.
 *
 * storageKey has NO unique index, so the dedupe is a lookup — if ANY asset
 * already tracks this key (whatever its status), authority exists and a
 * second registration would make the reaper's delete a double-free.
 */
export async function registerLegacyKeyForDeletion(
  userId: string,
  key: string,
  intent: MediaIntent,
): Promise<"registered" | "already-tracked"> {
  const existing = await MediaAssetModel.exists({ storageKey: key });
  if (existing) return "already-tracked";

  await MediaAssetModel.create({
    userId: new Types.ObjectId(userId),
    source: "legacy_backfill",
    intent,
    // Straight to the reaper's queue. nextDeleteAttemptAt MUST be set: the
    // lease filter matches $lte on an existing field, so a deletion_pending
    // row without it is stranded forever.
    status: "deletion_pending",
    storageKey: key,
    // Required by the schema but unknowable without S3 (and this path must
    // work during an outage — it runs inside account deletion).
    declaredContentType: "image/jpeg",
    declaredSizeBytes: 1,
    links: [],
    nextDeleteAttemptAt: new Date(),
  });
  return "registered";
}

/**
 * Registers a legacy key as a READY asset — the reconcile CLI's backfill
 * primitive. Never called during deletion.
 *
 * With a link, the asset is attached and lives for as long as its product
 * document does. Without one (a meal-scan photo no log ever echoed), it is
 * registered unattached WITH an expiresAt: queueExpiredMedia only reaps rows
 * that carry expiresAt, so an unattached ready row without one would be
 * stranded forever — visible to nothing, deleted by nothing.
 */
export type LegacyRegistrationOutcome =
  | "registered"
  | "already-tracked"
  /** Tracked by an asset that is not ready — do NOT point a document at it. */
  | "tracked-terminal"
  /** Tracked, but this document's link could not be recorded — see below. */
  | "link-not-applied";

export async function registerLegacyReadyAsset(input: {
  userId: string;
  key: string;
  source: LegacySourceName;
  /** null → register unattached (linkless sources, e.g. meal scans). */
  resourceId: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  /** Required when no link is being recorded; ignored otherwise. */
  unattachedExpiresAt?: Date;
}): Promise<{ mediaId: string; outcome: LegacyRegistrationOutcome }> {
  const spec = specFor(input.source);
  // A linkless source never records a link, however the ref reached us.
  const linkKind = spec.linkKind;
  const resourceId = linkKind ? input.resourceId : null;

  const existing = await MediaAssetModel.findOne({ storageKey: input.key });
  if (existing) {
    if (existing.status !== "ready") {
      // The key is tracked but on its way out (or never finished uploading).
      // Pointing a product document at it would resurrect a dying object.
      return { mediaId: existing._id.toString(), outcome: "tracked-terminal" };
    }
    if (!linkKind || !resourceId) {
      // Nothing to record. Note we must NOT touch expiresAt here: if a linked
      // referrer already claimed this object, re-imposing a TTL would set a
      // timer on a live photo.
      return { mediaId: existing._id.toString(), outcome: "already-tracked" };
    }

    // Two documents can share one object (a meal log echoing a scan's key, or
    // a duplicated log). The asset must list every referrer, or detaching one
    // would queue deletion while the other still shows it. Guarded push: only
    // when this link is absent and the row is under the 8-link cap.
    const pushed = await MediaAssetModel.updateOne(
      {
        _id: existing._id,
        status: "ready",
        links: {
          $not: { $elemMatch: { kind: linkKind, resourceId } },
        },
        $expr: { $lt: [{ $size: "$links" }, 8] },
      },
      {
        $push: {
          links: { kind: linkKind, resourceId, attachedAt: new Date() },
        },
      },
    );

    if (pushed.matchedCount === 0) {
      // Either the link is already there (fine — idempotent re-run) or the
      // guard genuinely refused: the cap is full, or the status changed under
      // us. Re-read to tell those apart, because "refused" MUST NOT be
      // reported as success — the caller would then point a document at an
      // asset that does not list it as a referrer, and the next detach of
      // some other referrer would free an object this document still shows.
      const current = await MediaAssetModel.findOne({ _id: existing._id });
      const linked = current?.links?.some(
        (link) => link.kind === linkKind && link.resourceId === resourceId,
      );
      if (current?.status !== "ready" || !linked) {
        return { mediaId: existing._id.toString(), outcome: "link-not-applied" };
      }
    }
    return { mediaId: existing._id.toString(), outcome: "already-tracked" };
  }

  if (!resourceId && !input.unattachedExpiresAt) {
    throw new Error("Unattached legacy assets must carry an expiry");
  }

  const sizeBytes = input.sizeBytes && input.sizeBytes > 0 ? input.sizeBytes : null;
  // contentType is the readability gate, not decoration: getMediaReadDetails
  // (what progress photos read through) matches on contentType "image/jpeg"
  // AND byteSize > 0, and 404s otherwise. Set it whenever S3 says the object
  // really is a jpeg. Non-jpeg legacy objects cannot satisfy the model's enum
  // — the reconcile CLI reports those instead of half-migrating them.
  const isJpeg = input.contentType === "image/jpeg";

  const created = await MediaAssetModel.create({
    userId: new Types.ObjectId(input.userId),
    source: "legacy_backfill",
    intent: spec.intent,
    status: "ready",
    storageKey: input.key,
    declaredContentType: input.contentType ?? "image/jpeg",
    declaredSizeBytes: sizeBytes ?? 1,
    ...(sizeBytes ? { byteSize: sizeBytes } : {}),
    ...(isJpeg && sizeBytes ? { contentType: "image/jpeg" as const } : {}),
    links:
      linkKind && resourceId
        ? [{ kind: linkKind, resourceId, attachedAt: new Date() }]
        : [],
    ...(resourceId ? {} : { expiresAt: input.unattachedExpiresAt }),
  });
  return { mediaId: created._id.toString(), outcome: "registered" };
}

/**
 * Whether a legacy object can be backfilled into a READABLE asset for this
 * source. Progress photos read through getMediaReadDetails, which requires a
 * jpeg content type and a known size; pointing one at an asset that cannot
 * satisfy that turns the photo — and the whole list endpoint that maps over
 * it — into a 404. The CLI reports these rather than migrating them.
 */
export function legacyBackfillReadable(
  source: LegacySourceName,
  contentType: string | null,
  sizeBytes: number | null,
): boolean {
  if (source !== "progressphotos.s3Key") return true;
  return contentType === "image/jpeg" && !!sizeBytes && sizeBytes > 0;
}

/**
 * Cross-user variant of the scan, for the reconcile CLI.
 *
 * Unlike the deletion sweep, this one DOES skip rows whose media pointer is
 * already set: those have nothing left to backfill. (Their raw key may still
 * be stale-but-present — that is the deletion sweep's and the orphan scan's
 * problem, and both read wider than this.)
 *
 * Soft-deleted rows are included and MARKED, not filtered: the native driver
 * bypasses the `deletedAt: null` query middleware, and a soft-deleted row's
 * photo must be queued for deletion rather than linked back to life.
 */
export async function scanAllLegacyMediaRefs(): Promise<LegacyMediaRef[]> {
  const refs: LegacyMediaRef[] = [];

  const push = (
    name: LegacySourceName,
    documentId: unknown,
    userId: unknown,
    key: string | null,
    legacyStatus?: string,
  ) => {
    if (!key || !userId) return;
    const spec = specFor(name);
    const owner = String(userId);
    refs.push({
      source: name,
      documentId: String(documentId),
      userId: owner,
      key,
      conforming: key.startsWith(spec.prefix(owner)),
      ...(legacyStatus ? { legacyStatus } : {}),
    });
  };

  const legacyFilter = (field: string, pointerField: string) => ({
    [field]: { $exists: true, $type: "string" as const, $ne: "" },
    [pointerField]: { $exists: false },
  });

  const [favourites, mealLogs, mealScans, users, progressPhotos] = await Promise.all([
    FavouriteModel.collection
      .find(legacyFilter("photoS3Key", "photoMediaId"))
      .project({ photoS3Key: 1, userId: 1 })
      .toArray(),
    MealLogModel.collection
      .find(legacyFilter("photoS3Key", "photoMediaId"))
      .project({ photoS3Key: 1, userId: 1, deletedAt: 1 })
      .toArray(),
    MealScanModel.collection
      .find(legacyFilter("photoS3Key", "photoMediaId"))
      .project({ photoS3Key: 1, userId: 1 })
      .toArray(),
    UserModel.collection
      .find(legacyFilter("avatarKey", "avatarMediaId"))
      .project({ avatarKey: 1 })
      .toArray(),
    ProgressPhotoModel.collection
      .find(legacyFilter("s3Key", "mediaId"))
      .project({ s3Key: 1, userId: 1, status: 1 })
      .toArray(),
  ]);

  for (const row of favourites) {
    push("favourites.photoS3Key", row._id, row.userId, stringOrNull(row.photoS3Key));
  }
  for (const row of mealLogs) {
    push(
      "meallogs.photoS3Key",
      row._id,
      row.userId,
      stringOrNull(row.photoS3Key),
      row.deletedAt ? "deleted" : undefined,
    );
  }
  for (const row of mealScans) {
    push("mealscans.photoS3Key", row._id, row.userId, stringOrNull(row.photoS3Key));
  }
  for (const row of users) {
    push("users.avatarKey", row._id, row._id, stringOrNull(row.avatarKey));
  }
  for (const row of progressPhotos) {
    push(
      "progressphotos.s3Key",
      row._id,
      row.userId,
      stringOrNull(row.s3Key),
      typeof row.status === "string" ? row.status : undefined,
    );
  }

  return refs;
}

/**
 * EVERY raw legacy key still stored anywhere, pointer set or not.
 *
 * This is the orphan scan's protection list, and it has to read wider than
 * the backfill scan: a row that already has a media pointer can still carry
 * a stale raw key, and treating that object as unreferenced would delete
 * something a live document still names.
 */
export async function scanAllLegacyKeys(): Promise<Set<string>> {
  const present = (field: string) => ({
    [field]: { $exists: true, $type: "string" as const, $ne: "" },
  });

  const [favourites, mealLogs, mealScans, users, progressPhotos] = await Promise.all([
    FavouriteModel.collection.find(present("photoS3Key")).project({ photoS3Key: 1 }).toArray(),
    MealLogModel.collection.find(present("photoS3Key")).project({ photoS3Key: 1 }).toArray(),
    MealScanModel.collection.find(present("photoS3Key")).project({ photoS3Key: 1 }).toArray(),
    UserModel.collection.find(present("avatarKey")).project({ avatarKey: 1 }).toArray(),
    ProgressPhotoModel.collection.find(present("s3Key")).project({ s3Key: 1 }).toArray(),
  ]);

  const keys = new Set<string>();
  const add = (value: unknown) => {
    const key = stringOrNull(value);
    if (key) keys.add(key);
  };
  for (const row of favourites) add(row.photoS3Key);
  for (const row of mealLogs) add(row.photoS3Key);
  for (const row of mealScans) add(row.photoS3Key);
  for (const row of users) add(row.avatarKey);
  for (const row of progressPhotos) add(row.s3Key);
  return keys;
}

/**
 * Points a product document at its backfilled asset. Native updateOne for the
 * same strictQuery reason as the reads — and it makes the CLI resumable: a
 * crash between asset creation and pointer set self-heals on the next run
 * (already-tracked → pointer written here).
 */
export async function setLegacyMediaPointer(
  source: LegacySourceName,
  documentId: string,
  mediaId: string,
): Promise<void> {
  const spec = specFor(source);
  const model = {
    "favourites.photoS3Key": FavouriteModel,
    "meallogs.photoS3Key": MealLogModel,
    "mealscans.photoS3Key": MealScanModel,
    "users.avatarKey": UserModel,
    "progressphotos.s3Key": ProgressPhotoModel,
  }[source];
  await model.collection.updateOne(
    { _id: new Types.ObjectId(documentId) },
    { $set: { [spec.mediaIdField]: new Types.ObjectId(mediaId) } },
  );
}

export interface LegacySweepResult {
  registered: number;
  alreadyTracked: number;
  nonConforming: number;
}

/**
 * Deletion-time sweep: gives every legacy object this user still references a
 * durable deletion record BEFORE their rows disappear.
 *
 * No S3 calls — account deletion must survive an AWS outage; the reaper does
 * the talking to S3 later, with retries. Non-conforming keys are counted and
 * logged but never registered: a key outside the user's own prefix may be
 * someone else's object, and deleting it on this user's say-so is the exact
 * attack the prefix check exists to stop.
 */
export async function sweepLegacyMediaForDeletion(
  userId: string,
): Promise<LegacySweepResult> {
  const refs = await scanLegacyMediaRefs(userId);
  const result: LegacySweepResult = {
    registered: 0,
    alreadyTracked: 0,
    nonConforming: 0,
  };

  // One key can be referenced twice — a meal log echoes its scan's key — and
  // registering it twice would hand the reaper two delete authorities for one
  // object. Dedupe the batch before touching the database.
  const seen = new Set<string>();
  for (const ref of refs) {
    if (!ref.conforming) {
      result.nonConforming += 1;
      continue;
    }
    if (seen.has(ref.key)) continue;
    seen.add(ref.key);

    const outcome = await registerLegacyKeyForDeletion(
      userId,
      ref.key,
      specFor(ref.source).intent,
    );
    if (outcome === "registered") result.registered += 1;
    else result.alreadyTracked += 1;
  }

  if (result.nonConforming > 0) {
    logger.warn(
      { userId: `${userId.slice(0, 6)}…`, nonConforming: result.nonConforming },
      "legacy media sweep skipped keys outside the user's prefix",
    );
  }

  return result;
}
