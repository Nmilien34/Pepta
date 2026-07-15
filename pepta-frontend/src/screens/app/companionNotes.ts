// Pure note engine for the Pep companion — contextual, prioritized, action-first
// nudges derived from HomeResponse. Helper, not coach: every nudge points at a
// concrete log action or celebrates a real win. No RN imports → testable.
//
// SEAM FOR AI: these are deterministic, local notes. A future `getCoachNotes()`
// (backend /coach → OpenAI, key server-side) can return CompanionNote[]s in this
// exact shape and be merged/prepended — no UI change needed.

import type { HomeResponse } from '@pepta/shared';
import { buildPepPriorities, type PepPriorityNote } from './pepPriorities';

export type CompanionNote = PepPriorityNote;

export function buildCompanionNotes(home: HomeResponse): CompanionNote[] {
  return buildPepPriorities({ home }).map((priority) => priority.note);
}
