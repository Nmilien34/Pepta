// Onboarding — Beat B · Company. Breathing room after the body-numbers cluster:
// one real, cited stat sitting straight on the ground (no card), then onward.

import React, { useState } from 'react';
import { CitedStat, ConvoButton, ConvoScreen } from '../../components';

export interface CompanyBeatScreenProps {
  progress: number;
  onBack?(): void;
  /** e.g. "Steady pace. 185 by Jan 17." */
  context?: string;
  onContinue(): void;
}

export function CompanyBeatScreen({ progress, onBack, context, onContinue }: CompanyBeatScreenProps) {
  // The stat lands the moment the line above it finishes typing, so the beat
  // arrives with the number rather than under the typewriter's own ticks.
  const [typed, setTyped] = useState(false);

  return (
    <ConvoScreen
      progress={progress}
      onBack={onBack}
      context={context}
      question="You’re in good company"
      questionAccent
      onTyped={() => setTyped(true)}
      footer={<ConvoButton label="Good to know" onPress={onContinue} />}
    >
      <CitedStat
        land={typed}
        style={{ paddingTop: 40 }}
        value="~15%"
        line="Average body-weight reduction at 68 weeks for adults on once-weekly semaglutide, the largest trial of its kind. Steady, tracked progress is the proven road."
        cite="STEP-1 trial, New England Journal of Medicine, 2021"
      />
    </ConvoScreen>
  );
}
