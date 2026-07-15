// Onboarding — Route (T5). Shown only when the picked medication doesn't pin
// how it's taken (compounded meds ship as injections AND oral drops/troches).
// The explicit answer overrides the catalog default and gates injection-only
// turns (device, concentration, shot day/time).

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
        { label: 'Injection', sub: 'pen, auto-injector, or syringe', value: 'injection' },
        { label: 'Pill or oral', sub: 'tablets, drops, or troches', value: 'oral' },
        { label: 'Not sure', sub: 'we’ll start with injection tracking', value: 'unsure' },
      ]}
      onAnswer={onAnswer}
    />
  );
}
