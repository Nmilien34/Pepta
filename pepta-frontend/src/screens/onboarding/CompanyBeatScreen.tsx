// Onboarding — Beat B · Company. Breathing room after the body-numbers cluster:
// one real, cited stat sitting straight on the ground (no card), then onward.
//
// THE HEADLINE IS NOT ABOUT SOLIDARITY (2026-08-25). It used to read "You're
// in good company", which was the same message notAlone opens the whole flow
// with 27 steps earlier — solidarity affirmed twice in one sitting. But only
// the HEADLINE was ever solidarity: what this screen actually carries is the
// STEP-1 efficacy number and, in the context line above it, the user's own
// projected goal date. That is the answer to "is this actually working",
// which is the live worry by this point, so the headline now names it.
//
// AND THE SCREEN CANNOT MOVE. companyContext reads pace and goalWeight, both
// of which are collected AFTER the body cluster (goalWeight #27, goalPace
// #28). Relocating this beat earlier to break up Act 3 sounds tidy and would
// silently gut it: projectGoal gets nothing, and the context collapses to the
// bare "Steady pace." fallback with no date at all.
//
// WHICH IS ALSO WHY THE HEADLINE STAYS DATE-FREE. That fallback is reachable
// (no body on file, or no resolvable projection), so a headline that points
// at "your date" would dangle whenever the date is the thing that is missing.

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
      question="The research is on your side"
      questionAccent
      onTyped={() => setTyped(true)}
      footer={<ConvoButton label="Good to hear" onPress={onContinue} />}
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
