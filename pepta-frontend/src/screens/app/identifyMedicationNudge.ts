/**
 * "Something else" cleanup nudge.
 *
 * The medication picker has an escape hatch — "Something else" — and onboarding
 * writes it through literally, so a real user ends up with a compound NAMED
 * "Something else". Everything downstream reads worse for it: the Home card,
 * dose reminders, the CSV export, and Pep's context all say "Something else".
 *
 * This finds those compounds and offers a rename IN PLACE. Renaming, never
 * re-creating: the compound id is the foreign key on every dose log, schedule,
 * and cycle the user already has, so a create-and-migrate would either orphan
 * that history or require rewriting it. A PATCH keeps every record attached and
 * costs one request.
 *
 * Deliberately quiet: no dose logs means the compound is noise from a user who
 * tapped through onboarding, not a medication anyone is actually taking.
 */

import type { CompoundResponse, DoseLogResponse } from "@pepta/shared";

/** The catalog's escape-hatch label, as onboarding writes it to the compound. */
export const UNIDENTIFIED_COMPOUND_NAME = "Something else";

/**
 * Dismissal binds to the compound, not the account: a user who says "Not now"
 * about one unidentified compound should still be asked about a different one
 * they create later. See DismissedNudge on the backend.
 */
export function identifyMedicationNudgeKey(compoundId: string): string {
  return `identify-medication:${compoundId}`;
}

export function isUnidentifiedCompound(compound: { name: string }): boolean {
  return (
    compound.name.trim().toLowerCase() ===
    UNIDENTIFIED_COMPOUND_NAME.toLowerCase()
  );
}

export interface IdentifyMedicationCandidate {
  compoundId: string;
  /** Live dose count — drives "your N logged doses stay attached". */
  doseCount: number;
  nudgeKey: string;
}

/**
 * The one compound to prompt about, or null.
 *
 * Returns a single candidate even when several qualify: this is a nudge on the
 * Home screen, not an inbox. The rest surface on later visits as each is
 * resolved or dismissed.
 */
export function identifyMedicationCandidate(input: {
  compounds: Pick<CompoundResponse, "id" | "name">[];
  doseLogs: Pick<DoseLogResponse, "compoundId" | "deletedAt">[];
  dismissedKeys: readonly string[];
}): IdentifyMedicationCandidate | null {
  const dismissed = new Set(input.dismissedKeys);

  for (const compound of input.compounds) {
    if (!isUnidentifiedCompound(compound)) continue;

    const nudgeKey = identifyMedicationNudgeKey(compound.id);
    if (dismissed.has(nudgeKey)) continue;

    const doseCount = input.doseLogs.filter(
      (dose) => dose.compoundId === compound.id && dose.deletedAt == null,
    ).length;
    // Zero doses = noise, not a medication. Stay silent.
    if (doseCount === 0) continue;

    return { compoundId: compound.id, doseCount, nudgeKey };
  }

  return null;
}

export const IDENTIFY_MEDICATION_COPY = {
  headline: "What are you actually taking?",
  body: (doseCount: number) =>
    `Your medication is saved as “${UNIDENTIFIED_COMPOUND_NAME}”. Tell us which one it is and Pepta can track your levels, dose reminders, and timing properly. Your ${doseCount === 1 ? "logged dose stays" : `${doseCount} logged doses stay`} attached.`,
  confirm: "Identify it",
  dismiss: "Not now",
} as const;
