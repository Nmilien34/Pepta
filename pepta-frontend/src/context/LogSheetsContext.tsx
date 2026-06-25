// Owns the QuickLog + MealLog sheets and exposes openers, so the FAB and the
// getting-started checklist (and anything else) can trigger a log flow — opening
// QuickLog straight to a specific form when asked.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { View } from "react-native";
import { AppText } from "../components/AppText";
import { Icon } from "../components/Icon";
import { QuickLogSheet, type QuickLogMode } from "../components/QuickLogSheet";
import { MealLogSheet } from "../components/MealLogSheet";
import { useTheme } from "../theme";

interface LogSheetsValue {
  openQuickLog(mode?: QuickLogMode): void;
  openMeal(): void;
}

interface LogToastMessage {
  title: string;
  detail?: string;
}

const LOG_TOAST_MS = 2400;

const LogSheetsContext = createContext<LogSheetsValue | undefined>(undefined);

export function LogSheetsProvider({ children }: { children: ReactNode }) {
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickMode, setQuickMode] = useState<QuickLogMode | undefined>(
    undefined,
  );
  const [mealOpen, setMealOpen] = useState(false);
  const [mealReturnsToQuickLog, setMealReturnsToQuickLog] = useState(false);
  const [toast, setToast] = useState<LogToastMessage | null>(null);
  const pendingMealOpen = useRef(false);
  const pendingQuickOpen = useRef(false);
  const mealOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (mealOpenTimer.current) clearTimeout(mealOpenTimer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const openQuickLog = useCallback((mode?: QuickLogMode) => {
    pendingMealOpen.current = false;
    pendingQuickOpen.current = false;
    if (mealOpenTimer.current) clearTimeout(mealOpenTimer.current);
    setMealReturnsToQuickLog(false);
    setQuickMode(mode);
    setQuickOpen(true);
  }, []);
  const openMeal = useCallback(() => {
    if (quickOpen) {
      pendingMealOpen.current = true;
      setMealReturnsToQuickLog(true);
      setQuickOpen(false);
      return;
    }
    setMealReturnsToQuickLog(false);
    setMealOpen(true);
  }, [quickOpen]);
  const handleQuickDismissed = useCallback(() => {
    if (!pendingMealOpen.current) return;
    pendingMealOpen.current = false;
    mealOpenTimer.current = setTimeout(() => {
      setMealOpen(true);
    }, 40);
  }, []);
  const handleMealBack = useCallback(() => {
    pendingQuickOpen.current = true;
    setMealOpen(false);
  }, []);
  const handleMealDismissed = useCallback(() => {
    if (!pendingQuickOpen.current) return;
    pendingQuickOpen.current = false;
    setMealReturnsToQuickLog(false);
    setQuickMode(undefined);
    setQuickOpen(true);
  }, []);
  const handleMealClose = useCallback(() => {
    pendingQuickOpen.current = false;
    setMealReturnsToQuickLog(false);
    setMealOpen(false);
  }, []);
  const showToast = useCallback((message: LogToastMessage) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, LOG_TOAST_MS);
  }, []);

  const value = useMemo<LogSheetsValue>(
    () => ({ openQuickLog, openMeal }),
    [openQuickLog, openMeal],
  );

  return (
    <LogSheetsContext.Provider value={value}>
      {children}
      <QuickLogSheet
        visible={quickOpen}
        initialMode={quickMode}
        onDismissed={handleQuickDismissed}
        onClose={() => setQuickOpen(false)}
        onMeal={openMeal}
        onQuickShotSaved={showToast}
      />
      <MealLogSheet
        visible={mealOpen}
        onClose={handleMealClose}
        onBack={mealReturnsToQuickLog ? handleMealBack : undefined}
        onDismissed={handleMealDismissed}
      />
      {toast ? <LogSavedToast message={toast} /> : null}
    </LogSheetsContext.Provider>
  );
}

export function useLogSheets(): LogSheetsValue {
  const value = useContext(LogSheetsContext);
  if (!value) {
    throw new Error("useLogSheets must be used within LogSheetsProvider");
  }
  return value;
}

function LogSavedToast({ message }: { message: LogToastMessage }) {
  const theme = useTheme();

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 18,
        right: 18,
        bottom: 104,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        shadowColor: theme.colors.shadow,
        shadowOpacity: 0.14,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 8,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.surfaceAlt,
        }}
      >
        <Icon name="checkmark" size={19} color={theme.colors.success} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" color="textPrimary">
          {message.title}
        </AppText>
        {message.detail ? (
          <AppText variant="caption" color="textSecondary">
            {message.detail}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
