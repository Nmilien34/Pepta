// THE TEST GAP THAT HID A DATA-LOSS BUG FOR AN ENTIRE RELEASE.
//
// mutationOutbox.test.ts mocks ./api wholesale, so the real zod input schemas
// are never exercised. That is exactly how weight shipped broken: the outbox
// stamps idempotencyKey onto EVERY payload, weightLogInputSchema was .strict()
// without that field, and api.createWeightLog parses before sending — so every
// weight log threw synchronously, was misclassified as a network failure, and
// sat at the head of the FIFO queue blocking every log behind it.
//
// This file deliberately does NOT mock the schemas. It runs the real parse for
// all nine kinds against exactly the body shape the outbox builds.

import { describe, expect, it } from "vitest";
import {
  activityLogInputSchema,
  doseLogInputSchema,
  fiberLogInputSchema,
  mealLogInputSchema,
  measurementInputSchema,
  proteinLogInputSchema,
  sideEffectLogInputSchema,
  waterLogInputSchema,
  weightLogInputSchema,
} from "@pepta/shared";
import type { OutboxKind } from "./mutationOutbox";
import { makeIdempotencyKey } from "./mutationOutbox";

const datetime = "2026-08-21T12:00:00.000Z";

/** One realistic payload per kind, as the app's callers build them. */
const PAYLOADS: Record<OutboxKind, Record<string, unknown>> = {
  dose: { compoundId: "507f1f77bcf86cd799439011", amount: 2.5, unit: "mg", datetime },
  weight: { value: 182, unit: "lb", datetime },
  sideEffect: { types: ["nausea"], severity: 2, datetime },
  measurement: { type: "waist", value: 34, unit: "in", datetime },
  activity: { resistanceTraining: true, workoutMinutes: 45, datetime },
  meal: { foodName: "Chicken bowl", protein: 44, calories: 610, source: "manual", datetime },
  protein: { grams: 30, datetime },
  water: { amountOz: 8, datetime },
  fiber: { grams: 5, datetime },
};

const SCHEMAS: Record<OutboxKind, { parse: (value: unknown) => unknown }> = {
  dose: doseLogInputSchema,
  weight: weightLogInputSchema,
  sideEffect: sideEffectLogInputSchema,
  measurement: measurementInputSchema,
  activity: activityLogInputSchema,
  meal: mealLogInputSchema,
  protein: proteinLogInputSchema,
  water: waterLogInputSchema,
  fiber: fiberLogInputSchema,
};

const KINDS = Object.keys(PAYLOADS) as OutboxKind[];

describe("every outbox payload survives its real schema", () => {
  it.each(KINDS)(
    "%s accepts the idempotencyKey the outbox stamps on it",
    (kind) => {
      // This is byte-for-byte what saveLogDurably sends.
      const body = { ...PAYLOADS[kind], idempotencyKey: makeIdempotencyKey() };

      expect(() => SCHEMAS[kind].parse(body)).not.toThrow();
    },
  );

  it("covers every kind the outbox can dispatch", () => {
    // A new OutboxKind with no payload here would silently skip the check
    // above — which is the shape of the original bug.
    expect(KINDS).toHaveLength(9);
    expect(new Set(KINDS).size).toBe(9);
  });

  it("still rejects a genuinely unknown field", () => {
    // The strictness that caught idempotencyKey is doing real work; this
    // asserts the fix did not simply loosen every schema.
    expect(() =>
      weightLogInputSchema.parse({ ...PAYLOADS.weight, notARealField: 1 }),
    ).toThrow();
  });
});
