// Persistence for the Log-a-shot section's Close. See doseCtaFold.ts for why
// it lasts a day rather than forever or a render.
//
// Device-local: presentation state, not health data.

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DOSE_CTA_FOLD_KEY, parseDoseCtaFold, type DoseCtaFold } from './doseCtaFold';

export function useDoseCtaFold(): {
  fold: DoseCtaFold | null;
  closeFor: (todayOnly: string) => void;
  reopen: () => void;
} {
  const [fold, setFold] = useState<DoseCtaFold | null>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(DOSE_CTA_FOLD_KEY)
      .then((raw) => {
        if (active) setFold(parseDoseCtaFold(raw));
      })
      // A failed read means "not closed", which shows the action. Never the
      // other way round: a storage error must not hide the logging button.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const closeFor = useCallback((todayOnly: string) => {
    const next: DoseCtaFold = { day: todayOnly };
    setFold(next);
    AsyncStorage.setItem(DOSE_CTA_FOLD_KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);

  const reopen = useCallback(() => {
    setFold(null);
    AsyncStorage.removeItem(DOSE_CTA_FOLD_KEY).catch(() => undefined);
  }, []);

  return { fold, closeFor, reopen };
}
