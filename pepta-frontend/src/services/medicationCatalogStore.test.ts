// The backend owns clinical values; the bundled list owns presentation and is
// the offline fallback (2026-08-11). The three things that must never break:
// a failed fetch still yields a usable picker, corrected values reach NEW
// compound creation, and nothing here can touch an existing compound.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MedicationCatalogItem } from "@pepta/shared";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  getItem: vi.fn(async () => null as string | null),
  setItem: vi.fn(async () => undefined),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: mocks.getItem, setItem: mocks.setItem },
}));
vi.mock("./api", () => ({ api: { listMedicationCatalog: mocks.list } }));

import { MEDICATION_CATALOG } from "../data/medicationCatalog";
import {
  CATALOG_TTL_MS,
  currentMedicationCatalog,
  loadMedicationCatalog,
  mergeCatalog,
  resetMedicationCatalogForTests,
  slugForOption,
} from "./medicationCatalogStore";
import { buildCompoundInput, todayDateOnly } from "../screens/app/addCompound";

function serverItem(slug: string, over: Partial<MedicationCatalogItem> = {}): MedicationCatalogItem {
  return {
    id: `id-${slug}`,
    slug,
    name: slug,
    drugClass: "glp_1",
    route: "injection",
    defaultFrequency: "weekly",
    commonDoses: [],
    halfLifeDays: 7,
    doseUnit: "mg",
    active: true,
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    ...over,
  } as MedicationCatalogItem;
}

describe("mergeCatalog", () => {
  it("takes clinical values from the server and keeps bundled presentation", () => {
    const merged = mergeCatalog(MEDICATION_CATALOG, [
      serverItem("rybelsus", { route: "oral", halfLifeDays: 7, commonDoses: [3, 7, 14] }),
    ]);
    const rybelsus = merged.find((m) => m.id === "rybelsus")!;
    const bundled = MEDICATION_CATALOG.find((m) => m.id === "rybelsus")!;
    expect(bundled.halfLifeDays).toBe(1); // the wrong bundled value…
    expect(rybelsus.halfLifeDays).toBe(7); // …corrected by the server
    // Presentation the server doesn't carry survives untouched.
    expect(rybelsus.subtitle).toBe(bundled.subtitle);
    expect(rybelsus.kind).toBe(bundled.kind);
    expect(rybelsus.tintColor).toBe(bundled.tintColor);
  });

  it("carries a null half-life through as not-modelled", () => {
    const merged = mergeCatalog(MEDICATION_CATALOG, [
      serverItem("research-peptide", { halfLifeDays: null }),
    ]);
    expect(merged.find((m) => m.id === "research_peptide")!.halfLifeDays).toBeNull();
  });

  it("matches underscore ids to hyphen slugs", () => {
    expect(slugForOption(MEDICATION_CATALOG.find((m) => m.id === "compounded_tirzepatide")!)).toBe(
      "compounded-tirzepatide",
    );
  });

  it("keeps bundle-only entries and ignores server-only ones", () => {
    const merged = mergeCatalog(MEDICATION_CATALOG, [serverItem("wegovy-pill")]);
    // Saxenda/Victoza and the custom-entry doorway are bundle-only — losing
    // any of them would delete medications or break the custom form.
    expect(merged.find((m) => m.id === "saxenda")).toBeTruthy();
    expect(merged.find((m) => m.id === "victoza")).toBeTruthy();
    expect(merged.find((m) => m.id === "other")).toBeTruthy();
    expect(merged).toHaveLength(MEDICATION_CATALOG.length);
    expect(merged.some((m) => m.name === "wegovy-pill")).toBe(false);
  });

  it("never blanks the dose chips when the server sends none", () => {
    const merged = mergeCatalog(MEDICATION_CATALOG, [serverItem("ozempic", { commonDoses: [] })]);
    const ozempic = merged.find((m) => m.id === "ozempic")!;
    expect(ozempic.commonDoses).toEqual(
      MEDICATION_CATALOG.find((m) => m.id === "ozempic")!.commonDoses,
    );
  });

  it("preserves routeAmbiguous — it gates the onboarding route question", () => {
    const merged = mergeCatalog(MEDICATION_CATALOG, [serverItem("compounded-tirzepatide")]);
    expect(merged.find((m) => m.id === "compounded_tirzepatide")!.routeAmbiguous).toBe(true);
  });
});

describe("loadMedicationCatalog", () => {
  beforeEach(() => {
    resetMedicationCatalogForTests();
    mocks.list.mockReset();
    mocks.getItem.mockReset().mockResolvedValue(null);
    mocks.setItem.mockReset().mockResolvedValue(undefined);
  });

  it("falls back to the bundled list when the fetch fails", async () => {
    mocks.list.mockRejectedValue(new Error("offline"));
    const result = await loadMedicationCatalog();
    expect(result).toEqual([...MEDICATION_CATALOG]);
    expect(currentMedicationCatalog().length).toBe(MEDICATION_CATALOG.length);
  });

  it("falls back when the server catalog is EMPTY (unseeded) — never a blank picker", async () => {
    mocks.list.mockResolvedValue([]);
    const result = await loadMedicationCatalog();
    expect(result).toEqual([...MEDICATION_CATALOG]);
  });

  it("applies and caches server values on a successful fetch", async () => {
    mocks.list.mockResolvedValue([serverItem("rybelsus", { route: "oral", halfLifeDays: 7 })]);
    const result = await loadMedicationCatalog();
    expect(result.find((m) => m.id === "rybelsus")!.halfLifeDays).toBe(7);
    expect(mocks.setItem).toHaveBeenCalled();
  });

  it("serves a FRESH cache without hitting the network", async () => {
    mocks.getItem.mockResolvedValue(
      JSON.stringify({
        fetchedAt: new Date(1_000_000).toISOString(),
        items: [serverItem("rybelsus", { route: "oral", halfLifeDays: 7 })],
      }),
    );
    const result = await loadMedicationCatalog(1_000_000 + CATALOG_TTL_MS - 1);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(result.find((m) => m.id === "rybelsus")!.halfLifeDays).toBe(7);
  });

  it("revalidates a STALE cache but still serves it if the refresh fails", async () => {
    mocks.getItem.mockResolvedValue(
      JSON.stringify({
        fetchedAt: new Date(0).toISOString(),
        items: [serverItem("rybelsus", { route: "oral", halfLifeDays: 7 })],
      }),
    );
    mocks.list.mockRejectedValue(new Error("offline"));
    const result = await loadMedicationCatalog(CATALOG_TTL_MS + 1);
    expect(mocks.list).toHaveBeenCalled();
    expect(result.find((m) => m.id === "rybelsus")!.halfLifeDays).toBe(7);
  });
});

describe("catalog values flow into NEW compound creation only", () => {
  it("a corrected half-life is what gets written on a new add", () => {
    const merged = mergeCatalog(MEDICATION_CATALOG, [
      serverItem("rybelsus", { route: "oral", halfLifeDays: 7 }),
    ]);
    const input = buildCompoundInput(
      merged.find((m) => m.id === "rybelsus")!,
      7,
      todayDateOnly(new Date(2026, 7, 11)),
    );
    expect(input.halfLifeDays).toBe(7);
  });

  it("an unmodelled catalog entry creates an unmodelled compound, not a fabricated one", () => {
    const merged = mergeCatalog(MEDICATION_CATALOG, [
      serverItem("research-peptide", { halfLifeDays: null }),
    ]);
    const input = buildCompoundInput(
      merged.find((m) => m.id === "research_peptide")!,
      null,
      todayDateOnly(new Date(2026, 7, 11)),
    );
    expect(input.halfLifeDays).toBeNull();
  });

  it("nothing in this module can mutate an existing compound", async () => {
    // Compounds denormalize halfLifeDays at creation and carry no catalog
    // reference, so a catalog change is invisible to anything already stored.
    // The store exposes no write path at all — this is the guard against one
    // being added later without thought.
    const store = await import("./medicationCatalogStore");
    const writeShaped = Object.keys(store).filter((key) => /update|patch|write|mutate|save/i.test(key));
    expect(writeShaped).toEqual([]);
  });
});
