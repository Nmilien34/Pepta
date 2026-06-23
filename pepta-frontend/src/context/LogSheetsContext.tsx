// Owns the QuickLog + MealLog sheets and exposes openers, so the FAB and the
// getting-started checklist (and anything else) can trigger a log flow — opening
// QuickLog straight to a specific form when asked.

import React, { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { QuickLogSheet, type QuickLogMode } from '../components/QuickLogSheet';
import { MealLogSheet } from '../components/MealLogSheet';

interface LogSheetsValue {
  openQuickLog(mode?: QuickLogMode): void;
  openMeal(): void;
}

const LogSheetsContext = createContext<LogSheetsValue | undefined>(undefined);

export function LogSheetsProvider({ children }: { children: ReactNode }) {
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickMode, setQuickMode] = useState<QuickLogMode | undefined>(undefined);
  const [mealOpen, setMealOpen] = useState(false);

  const openQuickLog = useCallback((mode?: QuickLogMode) => {
    setQuickMode(mode);
    setQuickOpen(true);
  }, []);
  const openMeal = useCallback(() => setMealOpen(true), []);

  const value = useMemo<LogSheetsValue>(() => ({ openQuickLog, openMeal }), [openQuickLog, openMeal]);

  return (
    <LogSheetsContext.Provider value={value}>
      {children}
      <QuickLogSheet
        visible={quickOpen}
        initialMode={quickMode}
        onClose={() => setQuickOpen(false)}
        onMeal={() => {
          setQuickOpen(false);
          setMealOpen(true);
        }}
      />
      <MealLogSheet visible={mealOpen} onClose={() => setMealOpen(false)} />
    </LogSheetsContext.Provider>
  );
}

export function useLogSheets(): LogSheetsValue {
  const value = useContext(LogSheetsContext);
  if (!value) {
    throw new Error('useLogSheets must be used within LogSheetsProvider');
  }
  return value;
}
