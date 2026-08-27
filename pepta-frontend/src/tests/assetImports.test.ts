// Every asset a source file imports must be COMMITTED, not merely present.
//
// The bug this pins: DiscoverySourceScreen imported discovery-appstore.png and
// discovery-reddit.png for weeks while both were untracked. Every local build
// worked — including four App Store archives — because the files happened to
// exist on this machine. A fresh clone, a CI runner or an EAS build would have
// failed at bundle time on an unresolvable import, and nothing in the repo
// hinted at it.
//
// SO THIS CHECKS THE GIT INDEX, NOT THE FILESYSTEM. A filesystem-only check is
// the exact assertion that passed while the bug was live: of course the file is
// there, that is why nobody noticed. `git ls-files` is what a clean clone would
// actually get.
//
// Metro resolves these paths, so this test resolves them the same way — from
// the importing file, not from the repo root.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** `from "…/assets/x.png"` and `require("…/assets/x.png")`. */
const ASSET_REFERENCE = /(?:from|require\()\s*['"]([^'"]*assets\/[^'"]+)['"]/g;

const PROJECT_ROOT = resolve(__dirname, "..", "..");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__fixtures__") continue;
      sourceFiles(full, out);
      continue;
    }
    // Test files are excluded: they may reference an asset in a comment or a
    // fixture, and they never ship in the bundle.
    if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) out.push(full);
  }
  return out;
}

/**
 * Paths git would hand a fresh clone, repo-root relative. The repo root is
 * ABOVE this package — Pepta is a workspace monorepo — so paths come back as
 * `pepta-frontend/assets/…`.
 */
function trackedFiles(): Set<string> {
  // --full-name, because `git ls-files` from a SUBDIRECTORY returns paths
  // relative to that directory, not the repo root. Without it every path
  // mismatches and the test reports the whole asset tree as untracked — a
  // failure so loud it would have been "fixed" by deleting the assertion.
  const out = execFileSync("git", ["ls-files", "--full-name"], {
    cwd: PROJECT_ROOT,
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return new Set(out.split("\n").filter(Boolean));
}

function repoRoot(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: PROJECT_ROOT,
    encoding: "utf-8",
  }).trim();
}

interface Reference {
  importer: string;
  spec: string;
  absolute: string;
}

function assetReferences(): Reference[] {
  const files = [
    ...sourceFiles(join(PROJECT_ROOT, "src")),
    join(PROJECT_ROOT, "App.tsx"),
  ].filter(existsSync);

  const refs: Reference[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf-8");
    for (const match of source.matchAll(ASSET_REFERENCE)) {
      const spec = match[1]!;
      refs.push({
        importer: relative(PROJECT_ROOT, file),
        spec,
        // Resolved from the IMPORTING file, the way Metro resolves it.
        absolute: resolve(dirname(file), spec),
      });
    }
  }
  return refs;
}

describe("every imported asset survives a clean clone", () => {
  const refs = assetReferences();

  it("finds asset imports at all, so a silent zero cannot pass", () => {
    // Without this, a regex that stops matching turns the whole suite green.
    expect(refs.length).toBeGreaterThan(20);
  });

  it("has no import pointing at a file that is missing on disk", () => {
    const missing = refs
      .filter((r) => !existsSync(r.absolute))
      .map((r) => `${r.spec}  (imported by ${r.importer})`);
    expect(missing).toEqual([]);
  });

  it("has no import pointing at a file git would not give a fresh clone", () => {
    const tracked = trackedFiles();
    const root = repoRoot();

    const untracked = refs
      .filter((r) => !tracked.has(relative(root, r.absolute)))
      .map((r) => `${r.spec}  (imported by ${r.importer})`);

    // Sorted and de-duped so the failure names every offender at once rather
    // than one per run.
    expect([...new Set(untracked)].sort()).toEqual([]);
  });
});
