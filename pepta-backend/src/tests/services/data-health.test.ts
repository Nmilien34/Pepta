import { describe, expect, it } from "vitest";
import {
  DETECTORS,
  dataHealthKey,
  duplicateCompounds,
  firstUnresolvedCard,
  missingDoseTime,
  unidentifiedMedication,
  type DataHealthCompound,
  type DataHealthContext,
  type DataHealthSchedule,
} from "../../services/data-health";

function compound(
  id: string,
  name: string,
  overrides: Partial<DataHealthCompound> = {},
): DataHealthCompound {
  return {
    id,
    name,
    route: "injection",
    plannedDose: 5,
    doseUnit: "mg",
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    halfLifeDays: 5,
    ...overrides,
  };
}

function schedule(
  id: string,
  compoundId: string,
  overrides: Partial<DataHealthSchedule> = {},
): DataHealthSchedule {
  return {
    id,
    compoundId,
    frequency: "daily",
    timesOfDay: [],
    daysOfWeek: [],
    ...overrides,
  };
}

function context(
  compounds: DataHealthCompound[],
  schedules: DataHealthSchedule[] = [],
  doseCounts: Record<string, number> = {},
): DataHealthContext {
  return {
    compounds,
    schedules,
    doseCounts: new Map(Object.entries(doseCounts)),
  };
}

describe("data health framework", () => {
  it("returns at most ONE card even when several detectors match", () => {
    // A user with all three problems at once must be asked about one thing.
    const ctx = context(
      [
        compound("c1", "Zepbound"),
        compound("c2", "Zepbound"),
        compound("c3", "Something else"),
      ],
      [schedule("s1", "c3", { frequency: "daily", timesOfDay: [] })],
      { c1: 3, c2: 1, c3: 2 },
    );

    const card = firstUnresolvedCard(DETECTORS, ctx, []);

    expect(card?.detector).toBe("duplicate-compounds");
  });

  it("respects registry priority: duplicates outrank a missing time", () => {
    const ctx = context(
      [compound("c1", "Foundayo", { route: "oral" }), compound("c2", "Foundayo", { route: "oral" })],
      [schedule("s1", "c1", { frequency: "daily", timesOfDay: [] })],
      { c1: 4, c2: 2 },
    );

    expect(firstUnresolvedCard(DETECTORS, ctx, [])?.detector).toBe(
      "duplicate-compounds",
    );
  });

  it("reveals the NEXT detector once the higher-priority one is dismissed", () => {
    const ctx = context(
      [compound("c1", "Something else")],
      [schedule("s1", "c1", { frequency: "daily", timesOfDay: [] })],
      { c1: 2 },
    );

    const first = firstUnresolvedCard(DETECTORS, ctx, []);
    expect(first?.detector).toBe("missing-dose-time");

    const next = firstUnresolvedCard(DETECTORS, ctx, [first!.key]);
    expect(next?.detector).toBe("unidentified-medication");

    expect(firstUnresolvedCard(DETECTORS, ctx, [first!.key, next!.key])).toBeNull();
  });

  it("keeps a dismissal effective while the facts are unchanged", () => {
    const ctx = context([compound("c1", "Something else")], [], { c1: 2 });
    const card = firstUnresolvedCard(DETECTORS, ctx, [])!;

    expect(firstUnresolvedCard(DETECTORS, ctx, [card.key])).toBeNull();
    // Same facts on a later visit → same key → still dismissed.
    expect(firstUnresolvedCard(DETECTORS, ctx, [card.key])).toBeNull();
  });

  it("re-fires a dismissed duplicate card when a THIRD duplicate appears", () => {
    const two = context(
      [compound("c1", "Zepbound"), compound("c2", "Zepbound")],
      [],
      { c1: 1, c2: 1 },
    );
    const dismissed = firstUnresolvedCard(DETECTORS, two, [])!.key;
    expect(firstUnresolvedCard(DETECTORS, two, [dismissed])).toBeNull();

    const three = context(
      [compound("c1", "Zepbound"), compound("c2", "Zepbound"), compound("c3", "Zepbound")],
      [],
      { c1: 1, c2: 1, c3: 1 },
    );

    // New fact, new key, no matching dismissal — the card comes back on its own.
    const refired = firstUnresolvedCard(DETECTORS, three, [dismissed]);
    expect(refired?.detector).toBe("duplicate-compounds");
    expect(refired?.key).not.toBe(dismissed);
  });

  it("derives keys deterministically and independently of fact order", () => {
    expect(dataHealthKey("d", "s", ["a", "b"])).toBe(
      dataHealthKey("d", "s", ["a", "b"]),
    );
    expect(dataHealthKey("d", "s", ["a", "b"])).not.toBe(
      dataHealthKey("d", "s", ["a", "c"]),
    );
    expect(dataHealthKey("d", "s", ["a"])).toMatch(
      /^[a-z0-9-]+:[A-Za-z0-9]+:[a-f0-9]{12}$/,
    );
  });

  it("returns null for a user whose data is healthy", () => {
    const ctx = context(
      [compound("c1", "Zepbound"), compound("c2", "Wegovy")],
      [schedule("s1", "c1", { frequency: "weekly" })],
      { c1: 5, c2: 2 },
    );
    expect(firstUnresolvedCard(DETECTORS, ctx, [])).toBeNull();
  });
});

describe("D1 duplicate compounds", () => {
  it("matches on normalized name and route", () => {
    const hit = duplicateCompounds.detect(
      context([compound("c1", "  ZEPBOUND "), compound("c2", "Zepbound")]),
    );
    expect(hit).not.toBeNull();
  });

  it("does not match the same name on a different route", () => {
    // Oral semaglutide and injectable semaglutide are genuinely two things.
    expect(
      duplicateCompounds.detect(
        context([
          compound("c1", "Semaglutide", { route: "oral" }),
          compound("c2", "Semaglutide", { route: "injection" }),
        ]),
      ),
    ).toBeNull();
  });

  it("surfaces the differences the user needs in order to choose", () => {
    const ctx = context(
      [
        compound("c1", "Foundayo", {
          route: "oral",
          plannedDose: 2,
          createdAt: new Date("2026-08-10T21:28:00.000Z"),
        }),
        compound("c2", "Foundayo", {
          route: "oral",
          plannedDose: 2.5,
          createdAt: new Date("2026-08-10T22:34:00.000Z"),
        }),
      ],
      [
        schedule("s1", "c1", { frequency: "daily", timesOfDay: ["18:00"] }),
        schedule("s2", "c2", { frequency: "daily", timesOfDay: ["09:00"] }),
      ],
      { c2: 2 },
    );

    const card = duplicateCompounds.detect(ctx)!.card("duplicate-compounds:c1:aaaaaaaaaaaa");
    if (card.detector !== "duplicate-compounds") throw new Error("wrong card");

    expect(card.candidates).toHaveLength(2);
    // Oldest first, so the chooser reads as a history.
    expect(card.candidates[0]!.compoundId).toBe("c1");
    expect(card.candidates[0]!.plannedDose).toBe(2);
    expect(card.candidates[0]!.doseCount).toBe(0);
    expect(card.candidates[0]!.scheduleSummary).toBe("Daily at 18:00");
    expect(card.candidates[1]!.plannedDose).toBe(2.5);
    expect(card.candidates[1]!.doseCount).toBe(2);
    expect(card.candidates[1]!.scheduleSummary).toBe("Daily at 09:00");
  });

  it("ignores a lone compound", () => {
    expect(duplicateCompounds.detect(context([compound("c1", "Zepbound")]))).toBeNull();
  });
});

describe("D2 missing dose time", () => {
  it("fires for a daily schedule with no stored time once a dose exists", () => {
    const hit = missingDoseTime.detect(
      context([compound("c1", "Foundayo", { route: "oral" })], [schedule("s1", "c1")], {
        c1: 3,
      }),
    );
    expect(hit?.subjectId).toBe("s1");
  });

  it("stays silent when the schedule already has a time", () => {
    expect(
      missingDoseTime.detect(
        context([compound("c1", "Foundayo")], [schedule("s1", "c1", { timesOfDay: ["08:00"] })], {
          c1: 3,
        }),
      ),
    ).toBeNull();
  });

  it("stays silent with no logged dose — a time cannot arm a projection yet", () => {
    // projectNextDoseAt returns null without a latest dose, so setting a time
    // here would change nothing the user can see.
    expect(
      missingDoseTime.detect(
        context([compound("c1", "Something else")], [schedule("s1", "c1")], { c1: 0 }),
      ),
    ).toBeNull();
  });

  it("leaves weekly and biweekly alone — they anchor to the last dose hour", () => {
    for (const frequency of ["weekly", "biweekly"]) {
      expect(
        missingDoseTime.detect(
          context([compound("c1", "Zepbound")], [schedule("s1", "c1", { frequency })], {
            c1: 4,
          }),
        ),
      ).toBeNull();
    }
  });

  it("re-asks when the schedule changes cadence", () => {
    const daily = missingDoseTime.detect(
      context([compound("c1", "Foundayo")], [schedule("s1", "c1")], { c1: 2 }),
    )!;
    const changed = missingDoseTime.detect(
      context([compound("c1", "Foundayo")], [schedule("s1", "c1", { frequency: "daily" })], {
        c1: 2,
      }),
    )!;
    expect(dataHealthKey("missing-dose-time", daily.subjectId, daily.facts)).toBe(
      dataHealthKey("missing-dose-time", changed.subjectId, changed.facts),
    );
  });
});

describe("D3 unidentified medication", () => {
  it("fires for a dosed 'Something else' compound", () => {
    const hit = unidentifiedMedication.detect(
      context([compound("c1", "Something else")], [], { c1: 2 }),
    );
    expect(hit?.subjectId).toBe("c1");
  });

  it("stays silent with zero doses", () => {
    expect(
      unidentifiedMedication.detect(context([compound("c1", "Something else")], [], { c1: 0 })),
    ).toBeNull();
  });

  it("leaves real medications alone", () => {
    expect(
      unidentifiedMedication.detect(context([compound("c1", "Zepbound")], [], { c1: 2 })),
    ).toBeNull();
  });
});

describe("D1 resolving D2", () => {
  it("stops asking about the missing time once the merge deactivates that schedule", () => {
    // Before: two Foundayo records. The keeper's schedule has a time; the
    // loser's does not, and the loser is the one carrying the doses.
    const before = context(
      [
        compound("keep", "Foundayo", { route: "oral" }),
        compound("loser", "Foundayo", { route: "oral" }),
      ],
      [
        schedule("s-keep", "keep", { frequency: "daily", timesOfDay: ["09:00"] }),
        schedule("s-loser", "loser", { frequency: "daily", timesOfDay: [] }),
      ],
      { keep: 1, loser: 3 },
    );
    expect(firstUnresolvedCard(DETECTORS, before, [])?.detector).toBe(
      "duplicate-compounds",
    );

    // After the merge: doses moved to the keeper, the loser's schedule is
    // deactivated (so it is no longer loaded), the loser is soft-deleted.
    const after = context(
      [compound("keep", "Foundayo", { route: "oral" })],
      [schedule("s-keep", "keep", { frequency: "daily", timesOfDay: ["09:00"] })],
      { keep: 4 },
    );

    // D2 must NOT fire: the timeless schedule is gone, and the survivor has a
    // time. This falls out of detectors reading fresh data, with no special case.
    expect(firstUnresolvedCard(DETECTORS, after, [])).toBeNull();
  });

  it("still asks for a time when the SURVIVING schedule has none", () => {
    const after = context(
      [compound("keep", "Foundayo", { route: "oral" })],
      [schedule("s-keep", "keep", { frequency: "daily", timesOfDay: [] })],
      { keep: 4 },
    );
    expect(firstUnresolvedCard(DETECTORS, after, [])?.detector).toBe(
      "missing-dose-time",
    );
  });
});
