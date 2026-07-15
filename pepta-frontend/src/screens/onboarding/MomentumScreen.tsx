// Onboarding — The last question (T22). Framed as the last, asked for honesty;
// every confession answer is pre-reframed in its own sub-line (the "haven't
// started" pick is the perfect starting point). Feeds the notifications echo.

import React from 'react';
import { ConvoScreen } from '../../components';

export type MomentumAnswer = 'locked_in' | 'wobbly' | 'not_started';

export interface MomentumScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  onAnswer(value: MomentumAnswer): void;
}

export function MomentumScreen({ progress, onBack, context, onAnswer }: MomentumScreenProps) {
  return (
    <ConvoScreen<MomentumAnswer>
      progress={progress}
      onBack={onBack}
      context={context}
      question="Last one. Be honest. How’s it going?"
      options={[
        { label: 'Locked in', sub: 'logging would make it airtight', value: 'locked_in' },
        { label: 'Wobbly, but going', value: 'wobbly' },
        { label: 'Haven’t really started', sub: 'the perfect starting point', value: 'not_started' },
      ]}
      onAnswer={onAnswer}
    />
  );
}
