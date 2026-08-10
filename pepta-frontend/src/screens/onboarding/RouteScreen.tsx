// Onboarding — Route (T5). Shown only when the picked medication doesn't pin
// how it's taken (compounded meds ship as injections AND oral drops/troches).
// The explicit answer overrides the catalog default and gates injection-only
// turns (device, concentration, shot day/time).
//
// NO "Not sure" OPTION (2026-08-11). It used to sit here and resolve silently
// to injection, writing a confident wrong route with nothing marking it as a
// guess. Nobody is genuinely unsure whether they inject or swallow their
// medication — they're unsure of the WORD — so the fix is plainer options,
// not a third answer. 'unsure' stays in the type: saved drafts from before
// this change can still carry it, and both the payload and the flow context
// resolve it exactly as they always did (requirement: never re-ask them).

import React from 'react';
import { ConvoScreen } from '../../components';

export type MedicationRoute = 'injection' | 'oral' | 'unsure';

export interface RouteScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  onAnswer(value: MedicationRoute): void;
}

export function RouteScreen({ progress, onBack, context, onAnswer }: RouteScreenProps) {
  return (
    <ConvoScreen<MedicationRoute>
      progress={progress}
      onBack={onBack}
      context={context}
      question="How do you take it?"
      options={[
        { label: 'Shot', sub: 'an injection pen or syringe', value: 'injection' },
        { label: 'Pill', sub: 'taken by mouth', value: 'oral' },
      ]}
      onAnswer={onAnswer}
    />
  );
}
