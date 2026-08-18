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
import { DoseCelebrationOverlay } from "../components/DoseCelebration";
import {
  doseCelebrationFor,
  type DoseCelebration,
} from "../screens/app/doseCelebration";
import { MealLogSheet, type MealSeed } from "../components/MealLogSheet";
import { useTheme } from "../theme";

interface LogSheetsValue {
  openQuickLog(mode?: QuickLogMode): void;
  openMeal(seed?: MealSeed | null, opts?: { keepAsRecipe?: boolean }): void;
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
  // Lives HERE rather than in the sheet: the sheet dismisses itself on commit,
  // so anything rendered inside it would unmount before it could be seen.
  const [celebration, setCelebration] = useState<DoseCelebration | null>(null);
  // HELD until the sheet is fully gone. QuickLogSheet is a native Modal, which
  // on iOS lives in its own window ABOVE this tree — showing the celebration on
  // commit would play the burst and most of the card's spring behind a sheet
  // that is still animating out, so the user meets it already half over.
  const pendingCelebration = useRef<DoseCelebration | null>(null);
  const pendingMealOpen = useRef(false);
  const pendingQuickOpen = useRef(false);
  const mealOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSeed = useRef<MealSeed | null>(null);
  const pendingKeepAsRecipe = useRef(false);
  const [keepAsRecipe, setKeepAsRecipe] = useState(false);
  const [mealSeed, setMealSeed] = useState<MealSeed | null>(null);

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
  const openMeal = useCallback(
    (seed?: MealSeed | null, opts?: { keepAsRecipe?: boolean }) => {
      // "Keep the result": the New-recipe routes reuse the meal sheet to
      // IDENTIFY food, then the commit saves a recipe instead of logging a
      // meal. Held on a ref for the same reason as the seed — the sheet can
      // open on a delay, and a flag that re-rendered away in between would
      // silently log the meal the user meant to save.
      pendingKeepAsRecipe.current = opts?.keepAsRecipe ?? false;
      setKeepAsRecipe(opts?.keepAsRecipe ?? false);
      // Held in a ref, not state: the sheet may open on a delay (below) and a
      // seed that re-rendered away in between would silently become a blank
      // manual form — the failure looks like "the tap did nothing".
      pendingSeed.current = seed ?? null;
      setMealSeed(seed ?? null);
      if (quickOpen) {
        pendingMealOpen.current = true;
        setMealReturnsToQuickLog(true);
        setQuickOpen(false);
        return;
      }
      setMealReturnsToQuickLog(false);
      setMealOpen(true);
    },
    [quickOpen],
  );
  const handleQuickDismissed = useCallback(() => {
    // Flush first, and unconditionally — the meal early-return below must not
    // swallow a queued celebration.
    if (pendingCelebration.current) {
      setCelebration(pendingCelebration.current);
      pendingCelebration.current = null;
    }
    if (!pendingMealOpen.current) return;
    pendingMealOpen.current = false;
    mealOpenTimer.current = setTimeout(() => {
      setMealSeed(pendingSeed.current);
      setKeepAsRecipe(pendingKeepAsRecipe.current);
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
        onMeal={() => openMeal()}
        onQuickShotSaved={showToast}
        onDoseLogged={(input) => {
          pendingCelebration.current = doseCelebrationFor(input);
          // GAP 2: the one-tap path also raises a "Shot saved" toast. Two
          // notifications for one tap is clutter, and the celebration already
          // says it — louder and with the payoff attached.
          setToast(null);
          if (toastTimer.current) clearTimeout(toastTimer.current);
        }}
      />
      <MealLogSheet
        seed={mealSeed}
        keepAsRecipe={keepAsRecipe}
        visible={mealOpen}
        onClose={handleMealClose}
        onBack={mealReturnsToQuickLog ? handleMealBack : undefined}
        onDismissed={handleMealDismissed}
      />
      {toast ? <LogSavedToast message={toast} /> : null}
      <DoseCelebrationOverlay
        celebration={celebration}
        onDone={() => setCelebration(null)}
      />
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
