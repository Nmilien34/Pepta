// The route turn must never write a route the user didn't actually choose
// (2026-08-11). The old "Not sure" option resolved silently to injection,
// producing a confident wrong record with nothing marking it a guess.

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { RouteScreen } from "./RouteScreen";
import { shouldSkipStep } from "./onboardingFlow";
import { buildOnboardingPayload } from "./onboardingPayload";
import { MEDICATION_CATALOG } from "../../data/medicationCatalog";

vi.mock("../../components", () => ({
  ConvoScreen: (props: Record<string, unknown>) =>
    React.createElement("ConvoScreen", props),
}));

function options() {
  let tree: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    tree = TestRenderer.create(
      <RouteScreen progress={0.2} onAnswer={vi.fn()} />,
    );
  });
  return tree!.root.findByType("ConvoScreen" as never).props.options as Array<{
    label: string;
    sub?: string;
    value: string;
  }>;
}

describe("RouteScreen options", () => {
  it("offers exactly two answers — the terminology is clarified, not a third guess", () => {
    expect(options()).toEqual([
      { label: "Shot", sub: "an injection pen or syringe", value: "injection" },
      { label: "Pill", sub: "taken by mouth", value: "oral" },
    ]);
  });

  it("has no escape hatch that resolves to a route the user never picked", () => {
    const values = options().map((option) => option.value);
    expect(values).not.toContain("unsure");
    expect(options().some((option) => /not sure/i.test(option.label))).toBe(false);
  });

  it("still asks the question, unchanged, for ambiguous catalog entries only", () => {
    const ambiguous = MEDICATION_CATALOG.filter((m) => m.routeAmbiguous);
    const pinned = MEDICATION_CATALOG.filter((m) => !m.routeAmbiguous);
    expect(ambiguous.length).toBeGreaterThan(0);
    for (const medication of ambiguous) {
      expect(
        shouldSkipStep("route", { journeyStage: "active", routeLocked: !medication.routeAmbiguous }),
      ).toBe(false);
    }
    for (const medication of pinned) {
      expect(
        shouldSkipStep("route", { journeyStage: "active", routeLocked: !medication.routeAmbiguous }),
      ).toBe(true);
    }
  });
});

describe("the chosen route reaches the compound", () => {
  const ambiguous = MEDICATION_CATALOG.find((m) => m.routeAmbiguous)!;
  const answers = {
    journeyStage: "active" as const,
    medication: ambiguous,
    dose: 5,
    frequency: "weekly" as const,
    lastShot: { year: 2026, month: 7, day: 9 },
    body: { units: "imperial" as const, height: 70, weight: 226 },
    goalWeight: 185,
    birthday: { year: 1992, month: 2, day: 14 },
    genderIdentity: "man" as const,
    activityLevel: "light" as const,
    trainingStatus: "returning" as const,
    goalType: "lose_fat" as const,
  };

  it("persists oral when the user picks Pill — the catalog's injection default does NOT win", () => {
    const payload = buildOnboardingPayload(
      { ...answers, route: "oral" },
      new Date(2026, 7, 11, 9, 0),
    );
    expect(ambiguous.route).toBe("injection"); // the default it had to override
    expect(payload.compound?.route).toBe("oral");
  });

  it("persists injection when the user picks Shot", () => {
    const payload = buildOnboardingPayload(
      { ...answers, route: "injection" },
      new Date(2026, 7, 11, 9, 0),
    );
    expect(payload.compound?.route).toBe("injection");
  });

  it("a legacy draft still carrying 'unsure' resolves exactly as before — never re-asked", () => {
    const payload = buildOnboardingPayload(
      { ...answers, route: "unsure" },
      new Date(2026, 7, 11, 9, 0),
    );
    expect(payload.compound?.route).toBe(ambiguous.route);
  });
});
