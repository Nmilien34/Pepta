/**
 * Data-health card copy and presentation. Pure — no RN imports.
 *
 * Copy lives HERE, not on the server. The server ships a detector name and the
 * facts; the app decides how to say it. That keeps wording an OTA rather than a
 * deploy, and keeps the backend from turning into a templating engine.
 *
 * Adding a detector is a copy block below plus a branch in DataHealthCardView.
 */

import type { DataHealthCard } from '@pepta/shared';

export interface DataHealthCopy {
  title: string;
  body: string;
  confirm: string;
  /** Always "Not now" today, but detector-owned so a card can soften it. */
  dismiss: string;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : `${count} ${many}`;
}

export function dataHealthCopy(card: DataHealthCard): DataHealthCopy {
  switch (card.detector) {
    case 'duplicate-compounds': {
      const name = card.candidates[0]?.name ?? 'this medication';
      return {
        title: `You have ${card.candidates.length} copies of ${name}`,
        // Names the risk in the user's terms — two records means two
        // countdowns — without implying we know which one is right.
        body: 'Two records for one medication means two schedules and two reminders. Pick the one you actually use and we’ll move your doses onto it — or keep both if you’re running them separately.',
        confirm: 'Sort this out',
        dismiss: 'Not now',
      };
    }
    case 'missing-dose-time':
      return {
        title: `When do you usually take ${card.compoundName}?`,
        body: 'We’ll remind you at the right time. Right now we’re guessing 9:00 AM.',
        confirm: 'Set the time',
        dismiss: 'Not now',
      };
    case 'unidentified-medication':
      return {
        title: 'What are you actually taking?',
        body: `Your medication is saved as “Something else”. Tell us which one it is and Pepta can track your levels, dose reminders, and timing properly. Your ${plural(card.doseCount, 'logged dose stays', 'logged doses stay')} attached.`,
        confirm: 'Identify it',
        dismiss: 'Not now',
      };
  }
}

/** "2.5 mg · Daily at 09:00 · 2 doses logged" — the row under each choice. */
export function describeDuplicateCandidate(candidate: {
  plannedDose: number | null;
  doseUnit: string;
  scheduleSummary: string | null;
  doseCount: number;
}): string {
  const parts: string[] = [];
  if (candidate.plannedDose != null) {
    parts.push(`${candidate.plannedDose} ${candidate.doseUnit}`);
  }
  if (candidate.scheduleSummary) parts.push(candidate.scheduleSummary);
  parts.push(
    candidate.doseCount === 0
      ? 'No doses logged'
      : plural(candidate.doseCount, '1 dose logged', 'doses logged'),
  );
  return parts.join(' · ');
}

/**
 * Which candidate to preselect: the one carrying the most dose history, ties
 * broken by the newer record. A preselection is a suggestion — the merge still
 * requires an explicit tap, because "different dose" is as likely to be a
 * titration step as a duplicate.
 */
export function suggestedKeeper(
  candidates: { compoundId: string; doseCount: number; createdAt: string }[],
): string | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort(
    (left, right) =>
      right.doseCount - left.doseCount ||
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )[0]!.compoundId;
}
