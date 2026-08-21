// Media pipeline operator CLI. Thin adapter over the media services — no
// separate logic path. Usage:
//
//   npm run media:reconcile          # dry-run: scan legacy refs, HEAD S3, report
//   npm run media:reconcile -- --execute
//   npm run media:orphans            # dry-run: unreferenced bucket objects
//   npm run media:orphans -- --older-than-days 30 --execute
//   npm run media:failed             # rows the reaper has given up on
//   npm run media:retry -- --id <id>[,<id>...] | --all
//   npm run media:check              # read-only bucket safety report
//
// Everything defaults to DRY-RUN; mutations need --execute (or, for retry,
// an explicit --id/--all) and, against production, CONFIRM_PRODUCTION=yes.
// Reconcile and orphan registration are idempotent — safe to re-run after a
// crash; already-tracked keys are skipped or repaired, never duplicated.
//
// S3 keys embed user ids; routine output masks them. --full-keys prints raw
// keys when an operator needs to act on a specific object.

import { connect, disconnect } from "../db/mongo";
import { env } from "../config/env";
import {
  LEGACY_SOURCES,
  legacyBackfillReadable,
  legacySpecFor,
  registerLegacyKeyForDeletion,
  registerLegacyReadyAsset,
  scanAllLegacyKeys,
  scanAllLegacyMediaRefs,
  setLegacyMediaPointer,
} from "../services/media-legacy.service";
import {
  listExhaustedMedia,
  retryExhaustedMedia,
} from "../services/media-cleanup.service";
import {
  describeBucketSafety,
  headS3Object,
  listS3Objects,
} from "../services/s3.service";
import { MediaAssetModel, type MediaIntent } from "../models/media-asset.model";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function confirmProductionMutation(action: string): void {
  if (!env.isProduction) return;
  if (process.env.CONFIRM_PRODUCTION === "yes") return;
  console.error(
    `Refusing to ${action} against PRODUCTION without CONFIRM_PRODUCTION=yes.`,
  );
  process.exit(1);
}

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

function maskKey(key: string): string {
  if (hasFlag("full-keys")) return key;
  return key.replace(/[0-9a-f]{24}/gi, (id) => `${id.slice(0, 6)}…`);
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = "name" in error && typeof error.name === "string" ? error.name : "";
  if (name === "NotFound" || name === "NoSuchKey") return true;
  const meta = (error as { $metadata?: { httpStatusCode?: number } }).$metadata;
  return meta?.httpStatusCode === 404;
}

// ---------------------------------------------------------------------------
// reconcile — backfill MediaAsset authority over legacy raw-key objects.
// ---------------------------------------------------------------------------

async function reconcile(): Promise<void> {
  const execute = hasFlag("execute");
  if (execute) confirmProductionMutation("backfill legacy media assets");

  const refs = await scanAllLegacyMediaRefs();
  if (refs.length === 0) {
    console.log("No legacy raw-key references remain. Nothing to reconcile.");
    return;
  }

  // Meal logs MUST precede meal scans: they can share one object, and the
  // log is the referrer that owns its lifetime — the scan just points along.
  const order = new Map(LEGACY_SOURCES.map((spec, index) => [spec.name, index]));
  const sorted = [...refs].sort(
    (a, b) => (order.get(a.source) ?? 99) - (order.get(b.source) ?? 99),
  );

  const counts = {
    registered: 0,
    linkedExisting: 0,
    queuedDeletion: 0,
    missingInS3: 0,
    nonConforming: 0,
    trackedTerminal: 0,
    linkNotApplied: 0,
    notReadable: 0,
    headErrors: 0,
  };
  const bySource = new Map<string, number>();
  let processed = 0;

  for (const ref of sorted) {
    processed += 1;
    if (processed % 25 === 0) console.log(`…${processed}/${sorted.length}`);
    bySource.set(ref.source, (bySource.get(ref.source) ?? 0) + 1);

    if (!ref.conforming) {
      counts.nonConforming += 1;
      console.log(
        `SKIP  ${ref.source} ${ref.documentId}: key outside owner prefix — ${maskKey(ref.key)}`,
      );
      continue;
    }

    // A row the user already deleted must not be linked back to life. Its
    // object gets a deletion record instead. (Meal logs are SOFT-deleted, and
    // the native reads that found this ref bypass the deletedAt middleware —
    // so without this branch reconcile would resurrect deleted meals' photos
    // and pin them with a link nothing would ever detach.) Deleting an absent
    // S3 key is a no-op, so this is safe even if an old path got there first.
    if (ref.legacyStatus === "deleted") {
      if (execute) {
        await registerLegacyKeyForDeletion(
          ref.userId,
          ref.key,
          legacySpecFor(ref.source).intent,
        );
      }
      counts.queuedDeletion += 1;
      console.log(`REAP  deleted ${ref.source} row — ${maskKey(ref.key)}`);
      continue;
    }

    let head: { contentType: string | null; contentLength: number | null };
    try {
      head = await headS3Object(ref.key);
    } catch (error) {
      if (isNotFound(error)) {
        counts.missingInS3 += 1;
        console.log(`MISS  ${ref.source} ${ref.documentId}: object gone — ${maskKey(ref.key)}`);
      } else {
        counts.headErrors += 1;
        console.log(
          `ERR   ${ref.source} ${ref.documentId}: HEAD failed (${(error as Error).name}) — ${maskKey(ref.key)}`,
        );
      }
      continue;
    }

    // Progress photos are read through getMediaReadDetails, which demands a
    // jpeg content type and a known size. Pointing one at an asset that
    // cannot satisfy that would 404 the photo AND the whole list endpoint
    // that maps over it — worse than leaving the row untouched for a human.
    if (!legacyBackfillReadable(ref.source, head.contentType, head.contentLength)) {
      counts.notReadable += 1;
      console.log(
        `SKIP  ${ref.source} ${ref.documentId}: ${head.contentType ?? "unknown type"} cannot be served as a progress photo — ${maskKey(ref.key)}`,
      );
      continue;
    }

    // Meal scans never claim the object's lifetime — nothing detaches a scan,
    // so a scan link would pin the asset above zero links forever. The spec's
    // linkKind is null for them; the asset is registered unattached with the
    // meal TTL and ages out on its own unless a real referrer (a meal log)
    // claims it. This is decided by the SOURCE, never by what already exists,
    // so a crash-resumed run reaches the same answer as a clean one.
    const linkless = legacySpecFor(ref.source).linkKind === null;

    if (!execute) {
      counts.registered += 1;
      console.log(
        `PLAN  ${ref.source} ${ref.documentId}: would register${linkless ? " (unattached, 7d TTL if new)" : ""} — ${maskKey(ref.key)}`,
      );
      continue;
    }

    const result = await registerLegacyReadyAsset({
      userId: ref.userId,
      key: ref.key,
      source: ref.source,
      resourceId: linkless ? null : ref.documentId,
      contentType: head.contentType,
      sizeBytes: head.contentLength,
      ...(linkless
        ? { unattachedExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
        : {}),
    });

    if (result.outcome === "tracked-terminal") {
      counts.trackedTerminal += 1;
      console.log(
        `SKIP  ${ref.source} ${ref.documentId}: key tracked by a dying asset — ${maskKey(ref.key)}`,
      );
      continue;
    }
    if (result.outcome === "link-not-applied") {
      // The asset would not record this document as a referrer (link cap
      // full, or its status moved under us). Writing the pointer anyway would
      // leave a live document pointing at an object whose last recorded
      // referrer can free it.
      counts.linkNotApplied += 1;
      console.log(
        `SKIP  ${ref.source} ${ref.documentId}: asset would not record this referrer — ${maskKey(ref.key)}`,
      );
      continue;
    }

    await setLegacyMediaPointer(ref.source, ref.documentId, result.mediaId);
    if (result.outcome === "registered") counts.registered += 1;
    else counts.linkedExisting += 1;
  }

  console.log("");
  console.log(execute ? "Reconcile complete." : "DRY RUN — nothing was written. Re-run with --execute.");
  for (const [source, count] of bySource) console.log(`  ${source}: ${count} refs`);
  console.log(
    `  ${execute ? "registered" : "would register"}: ${counts.registered}, pointed at existing: ${counts.linkedExisting}, queued deletion: ${counts.queuedDeletion}`,
  );
  console.log(
    `  missing in S3: ${counts.missingInS3}, non-conforming (untouched): ${counts.nonConforming}, tracked-by-dying-asset: ${counts.trackedTerminal}, HEAD errors: ${counts.headErrors}`,
  );
  console.log(
    `  left for a human — unservable content type: ${counts.notReadable}, referrer not recordable: ${counts.linkNotApplied}`,
  );
  if (counts.headErrors > 0) {
    console.log("  HEAD errors are retryable — run reconcile again.");
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// orphans — bucket objects nothing references any more.
// ---------------------------------------------------------------------------

/** Where an orphan's owner and intent can be read off the key itself. */
const ORPHAN_PREFIXES: { prefix: string; intent: MediaIntent }[] = [
  { prefix: "favourites/", intent: "favourite_photo" },
  { prefix: "pepta/avatars/", intent: "avatar" },
  { prefix: "pepta/progress-photos/", intent: "progress_photo" },
  { prefix: "pepta/meal-scans/", intent: "meal_photo" },
  // Pipeline-era keys whose asset row has since been hard-removed. Intent is
  // vestigial on a deletion-only record; meal_photo is the neutral choice.
  { prefix: "pepta/media/", intent: "meal_photo" },
  { prefix: "pepta/media-staging/", intent: "meal_photo" },
];

function orphanOwner(key: string): { userId: string; intent: MediaIntent } | null {
  for (const { prefix, intent } of ORPHAN_PREFIXES) {
    if (!key.startsWith(prefix)) continue;
    const userId = key.slice(prefix.length).split("/")[0] ?? "";
    return OBJECT_ID_RE.test(userId) ? { userId, intent } : null;
  }
  return null;
}

async function orphans(): Promise<void> {
  const execute = hasFlag("execute");
  const olderThanDays = Number(arg("older-than-days") ?? 30);
  if (!Number.isFinite(olderThanDays) || olderThanDays < 1) {
    console.error("--older-than-days must be a positive number of days.");
    process.exit(1);
  }
  if (execute) confirmProductionMutation("queue orphaned S3 objects for deletion");

  // Every key the database still knows about, from either era. The legacy
  // half deliberately uses the WIDE scan (every raw key, pointer set or not):
  // a migrated row can still carry a stale raw key, and the orphan scan must
  // never race the migration — or a half-cleared field — into deleting an
  // object some live document still names.
  const [storageKeys, stagingKeys, legacyKeys] = await Promise.all([
    MediaAssetModel.distinct("storageKey"),
    MediaAssetModel.distinct("stagingKey"),
    scanAllLegacyKeys(),
  ]);
  const referenced = new Set<string>([
    ...storageKeys.filter((key): key is string => typeof key === "string"),
    ...stagingKeys.filter((key): key is string => typeof key === "string"),
    ...legacyKeys,
  ]);

  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const found: { key: string; sizeBytes: number }[] = [];
  let scanned = 0;
  let tooRecent = 0;

  // Favourites lived OUTSIDE the pepta/ namespace — a pepta/-only sweep
  // misses every legacy favourite photo. Both roots, always.
  for (const prefix of ["pepta/", "favourites/"]) {
    let continuationToken: string | undefined;
    do {
      const page = await listS3Objects({ prefix, continuationToken });
      for (const object of page.objects) {
        scanned += 1;
        if (referenced.has(object.key)) continue;
        // Age gate: an object with no recorded age never qualifies, and a
        // young one may belong to an upload still in flight.
        if (!object.lastModified || object.lastModified > cutoff) {
          tooRecent += 1;
          continue;
        }
        found.push({ key: object.key, sizeBytes: object.sizeBytes });
      }
      continuationToken = page.nextContinuationToken ?? undefined;
    } while (continuationToken);
  }

  const totalBytes = found.reduce((sum, object) => sum + object.sizeBytes, 0);
  console.log(
    `Scanned ${scanned} objects; ${referenced.size} referenced in the database.`,
  );
  console.log(
    `Orphans older than ${olderThanDays}d: ${found.length} (${(totalBytes / 1024 / 1024).toFixed(1)} MB); unreferenced but too recent/undated: ${tooRecent}.`,
  );

  let queued = 0;
  let unowned = 0;
  for (const orphan of found) {
    const owner = orphanOwner(orphan.key);
    if (!owner) {
      unowned += 1;
      console.log(`SKIP  no parseable owner — ${maskKey(orphan.key)}`);
      continue;
    }
    if (!execute) {
      console.log(`PLAN  would queue deletion — ${maskKey(orphan.key)}`);
      queued += 1;
      continue;
    }
    const outcome = await registerLegacyKeyForDeletion(
      owner.userId,
      orphan.key,
      owner.intent,
    );
    if (outcome === "registered") queued += 1;
  }

  console.log("");
  console.log(execute ? "Orphan queueing complete." : "DRY RUN — nothing was queued. Re-run with --execute.");
  console.log(
    `  ${execute ? "queued for the reaper" : "would queue"}: ${queued}, no parseable owner (left alone): ${unowned}`,
  );
}

// ---------------------------------------------------------------------------
// failed / retry — the reaper's parked rows.
// ---------------------------------------------------------------------------

async function failed(): Promise<void> {
  const limitArg = arg("limit");
  const limit = limitArg === undefined ? 100 : Number(limitArg);
  if (!Number.isFinite(limit) || limit < 1) {
    console.error("--limit must be a positive number.");
    process.exit(1);
  }
  const rows = await listExhaustedMedia(limit);
  if (rows.length === 0) {
    console.log("No media rows have exhausted their delete retries.");
    return;
  }
  console.log(`${rows.length} row(s) parked after exhausting delete retries:`);
  for (const row of rows) {
    console.log(
      `  ${row.id}  user=${row.userId.slice(0, 6)}…  ${row.status}/${row.intent}  attempts=${row.deleteAttemptCount}  ` +
        `storage=${row.storageKey ? maskKey(row.storageKey) : "—"}  staging=${row.stagingKey ? maskKey(row.stagingKey) : "—"}  ` +
        `last-touched=${row.lastUpdatedAt?.toISOString() ?? "unknown"}`,
    );
  }
  console.log("");
  console.log("Retry with: npm run media:retry -- --id <id>[,<id>...]  (or --all)");
}

async function retry(): Promise<void> {
  const idsArg = arg("id");
  const all = hasFlag("all");
  if (!idsArg && !all) {
    console.error("Pass --id <id>[,<id>...] or --all.");
    process.exit(1);
  }
  const ids = idsArg
    ? idsArg.split(",").map((value) => value.trim()).filter(Boolean)
    : undefined;
  // A list that filters down to nothing ("--id ," or "--id ' '") must NOT
  // fall through to the unscoped filter — that would silently requeue every
  // parked row in the collection off a typo.
  if (ids && ids.length === 0) {
    console.error("--id was given but contained no ids. Pass --all to requeue every parked row.");
    process.exit(1);
  }
  if (ids?.some((value) => !OBJECT_ID_RE.test(value))) {
    console.error("Every --id must be a 24-hex MediaAsset id.");
    process.exit(1);
  }

  confirmProductionMutation("requeue exhausted media deletions");
  const modified = await retryExhaustedMedia(ids);
  console.log(
    modified === 0
      ? "Nothing to retry — no matching parked rows."
      : `Requeued ${modified} row(s); the cleanup worker will pick them up on its next pass.`,
  );
}

// ---------------------------------------------------------------------------
// check — read-only bucket safety report.
// ---------------------------------------------------------------------------

async function check(): Promise<void> {
  const report = await describeBucketSafety();
  let warnings = 0;
  const warn = (message: string) => {
    warnings += 1;
    console.log(`  WARN  ${message}`);
  };
  const pass = (message: string) => console.log(`  ok    ${message}`);

  console.log(`Bucket: ${report.bucketName}`);

  const block = report.publicAccessBlock;
  if (
    block?.blockPublicAcls &&
    block.ignorePublicAcls &&
    block.blockPublicPolicy &&
    block.restrictPublicBuckets
  ) {
    pass("public access fully blocked");
  } else if (block) {
    warn(
      `public access block incomplete: ${JSON.stringify(block)} — user photos may be exposable`,
    );
  } else {
    warn("no public access block configured — user photos may be exposable");
  }

  if (report.encryptionAlgorithms?.length) {
    pass(`encryption at rest: ${report.encryptionAlgorithms.join(", ")}`);
  } else {
    warn("no default bucket encryption configured");
  }

  if (report.corsRules === null) {
    pass("no CORS configuration (uploads are presigned POSTs; browser CORS not required)");
  } else {
    for (const rule of report.corsRules) {
      const mutating = rule.allowedMethods.some((method) => method !== "GET" && method !== "HEAD");
      if (rule.allowedOrigins.includes("*") && mutating) {
        warn(
          `CORS rule allows * origin with ${rule.allowedMethods.join("/")} — tighten to app origins`,
        );
      } else {
        pass(`CORS rule: ${rule.allowedOrigins.join(",")} → ${rule.allowedMethods.join("/")}`);
      }
    }
  }

  if (report.lifecycleRules?.length) {
    pass(
      `lifecycle rules: ${report.lifecycleRules
        .map((rule) => `${rule.id ?? "unnamed"} (${rule.status ?? "?"})`)
        .join(", ")}`,
    );
  } else {
    warn(
      "no lifecycle rules — consider one aborting incomplete multipart uploads so failed uploads don't accrete",
    );
  }

  console.log("");
  console.log(warnings === 0 ? "All checks passed." : `${warnings} warning(s).`);
  if (warnings > 0) process.exitCode = 1;
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const command = process.argv[2];
  await connect();

  switch (command) {
    case "reconcile":
      await reconcile();
      break;
    case "orphans":
      await orphans();
      break;
    case "failed":
      await failed();
      break;
    case "retry":
      await retry();
      break;
    case "check":
      await check();
      break;
    default:
      console.error(
        "Usage: media-admin.ts <reconcile|orphans|failed|retry|check> [--execute] [--older-than-days N] [--id <id>[,<id>...]] [--all] [--limit N] [--full-keys]",
      );
      process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  })
  .finally(() => void disconnect());
