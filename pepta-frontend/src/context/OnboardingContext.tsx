import React, { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { OnboardingCompleteInput } from '@pepta/shared';

interface OnboardingContextValue {
  draft: Partial<OnboardingCompleteInput>;
  updateDraft(nextDraft: Partial<OnboardingCompleteInput>): void;
  resetDraft(): void;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Partial<OnboardingCompleteInput>>({});

  const value = useMemo<OnboardingContextValue>(
    () => ({
      draft,
      updateDraft(nextDraft) {
        setDraft((current) => ({ ...current, ...nextDraft }));
      },
      resetDraft() {
        setDraft({});
      },
    }),
    [draft],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const value = useContext(OnboardingContext);
  if (!value) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }

  return value;
}
