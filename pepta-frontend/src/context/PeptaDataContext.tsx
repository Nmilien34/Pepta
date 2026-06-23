// Pepta data layer. Home is a single aggregated endpoint (GET /home →
// HomeResponse with built-in sectionErrors), so we don't fan out like Leanient —
// one fetch, with first-load vs pull-to-refresh + error state (Leanient's
// isLoading / isRefreshing / homeError shape). Inline steppers update
// optimistically; the background POST is a TODO (the api service has no log
// methods yet).

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  DoseLogInput,
  DoseLogResponse,
  HomeResponse,
  MealLogInput,
  MeasurementInput,
  MeasurementResponse,
  ProgressResponse,
  SideEffectLogInput,
  SideEffectLogResponse,
  TrackResponse,
  WeightLogInput,
  WeightLogResponse,
} from '@pepta/shared';
import { api } from '../services/api';

// Build a throwaway optimistic record from a log input (temp id; replaced by the
// real row on the next refresh). Cast is safe — it's local-only, never validated.
function optimisticRow<T>(input: object): T {
  return {
    ...input,
    id: `temp-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    userId: 'me',
    deletedAt: null,
    createdAt: (input as { datetime?: string }).datetime ?? new Date().toISOString(),
    updatedAt: (input as { datetime?: string }).datetime ?? new Date().toISOString(),
  } as T;
}

interface PeptaDataContextValue {
  home: HomeResponse | null;
  homeLoading: boolean; // first load (no data yet)
  homeRefreshing: boolean; // pull-to-refresh (data already shown)
  homeError: string | null;
  refreshHome(): Promise<void>;
  // Optimistic inline-stepper updates (Home water/protein).
  bumpProtein(grams: number): void;
  bumpWater(oz: number): void;
  track: TrackResponse | null;
  trackLoading: boolean;
  trackRefreshing: boolean;
  trackError: string | null;
  refreshTrack(): Promise<void>;
  progress: ProgressResponse | null;
  progressLoading: boolean;
  progressRefreshing: boolean;
  progressError: string | null;
  refreshProgress(): Promise<void>;
  // Optimistic inserts for the QuickLog sheet (prepend a temp row; the next
  // refresh reconciles to server truth).
  addDoseLog(input: DoseLogInput): void;
  addWeightLog(input: WeightLogInput): void;
  addMeasurement(input: MeasurementInput): void;
  addSideEffectLog(input: SideEffectLogInput): void;
  // Optimistically fold a logged meal into today's Home macro totals.
  addMeal(input: MealLogInput): void;
}

const PeptaDataContext = createContext<PeptaDataContextValue | undefined>(undefined);

function errorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  // Always log the raw cause so it shows in the Metro/device console.
  console.warn('[PeptaData] request failed:', detail);
  if (/network|fetch|Network request failed/i.test(detail)) {
    return 'Couldn’t reach Pepta — check your connection.';
  }
  // Surface the real cause (HTTP status or a schema-parse error) instead of a
  // generic message, so failures are diagnosable on-device.
  return `Couldn’t load your data.\n(${detail})`;
}

export function PeptaDataProvider({ children }: { children: ReactNode }) {
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeRefreshing, setHomeRefreshing] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [track, setTrack] = useState<TrackResponse | null>(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackRefreshing, setTrackRefreshing] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressRefreshing, setProgressRefreshing] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const hasData = useRef(false);
  const hasTrack = useRef(false);
  const hasProgress = useRef(false);

  const refreshHome = useCallback(async () => {
    setHomeError(null);
    if (hasData.current) setHomeRefreshing(true);
    else setHomeLoading(true);
    try {
      const data = await api.getHome();
      setHome(data);
      hasData.current = true;
    } catch (error) {
      setHomeError(errorMessage(error));
    } finally {
      setHomeLoading(false);
      setHomeRefreshing(false);
    }
  }, []);

  // Optimistic inline-stepper bumps. We update the on-screen total immediately,
  // then persist a positive delta as a new log (the backend log model is
  // append-only, so a negative "− " is treated as a local correction that the
  // next refresh reconciles to server truth). On a failed POST we revert.
  const bumpProtein = useCallback((grams: number) => {
    setHome((h) => (h ? { ...h, todayProteinGrams: Math.max(0, h.todayProteinGrams + grams) } : h));
    if (grams <= 0) return;
    api.createProteinLog({ grams, datetime: new Date().toISOString() }).catch(() => {
      setHome((h) => (h ? { ...h, todayProteinGrams: Math.max(0, h.todayProteinGrams - grams) } : h));
    });
  }, []);
  const bumpWater = useCallback((oz: number) => {
    setHome((h) => (h ? { ...h, todayWaterOz: Math.max(0, h.todayWaterOz + oz) } : h));
    if (oz <= 0) return;
    api.createWaterLog({ amountOz: oz, datetime: new Date().toISOString() }).catch(() => {
      setHome((h) => (h ? { ...h, todayWaterOz: Math.max(0, h.todayWaterOz - oz) } : h));
    });
  }, []);

  const refreshTrack = useCallback(async () => {
    setTrackError(null);
    if (hasTrack.current) setTrackRefreshing(true);
    else setTrackLoading(true);
    try {
      const data = await api.getTrack();
      setTrack(data);
      hasTrack.current = true;
    } catch (error) {
      setTrackError(errorMessage(error));
    } finally {
      setTrackLoading(false);
      setTrackRefreshing(false);
    }
  }, []);
  const addDoseLog = useCallback((input: DoseLogInput) => {
    setTrack((t) => (t ? { ...t, doseLogs: [optimisticRow<DoseLogResponse>(input), ...t.doseLogs] } : t));
  }, []);
  const addSideEffectLog = useCallback((input: SideEffectLogInput) => {
    setTrack((t) => (t ? { ...t, sideEffectLogs: [optimisticRow<SideEffectLogResponse>(input), ...t.sideEffectLogs] } : t));
  }, []);
  const addWeightLog = useCallback((input: WeightLogInput) => {
    setProgress((p) => (p ? { ...p, weights: [...p.weights, optimisticRow<WeightLogResponse>(input)] } : p));
  }, []);
  const addMeasurement = useCallback((input: MeasurementInput) => {
    setProgress((p) => (p ? { ...p, measurements: [optimisticRow<MeasurementResponse>(input), ...p.measurements] } : p));
  }, []);
  const addMeal = useCallback((input: MealLogInput) => {
    setHome((h) =>
      h
        ? {
            ...h,
            todayProteinGrams: h.todayProteinGrams + input.protein,
            todayCalories: h.todayCalories + input.calories,
            todayFiberGrams: h.todayFiberGrams + (input.fiber ?? 0),
          }
        : h,
    );
  }, []);

  const refreshProgress = useCallback(async () => {
    setProgressError(null);
    if (hasProgress.current) setProgressRefreshing(true);
    else setProgressLoading(true);
    try {
      const data = await api.getProgress();
      setProgress(data);
      hasProgress.current = true;
    } catch (error) {
      setProgressError(errorMessage(error));
    } finally {
      setProgressLoading(false);
      setProgressRefreshing(false);
    }
  }, []);

  const value = useMemo<PeptaDataContextValue>(
    () => ({
      home,
      homeLoading,
      homeRefreshing,
      homeError,
      refreshHome,
      bumpProtein,
      bumpWater,
      track,
      trackLoading,
      trackRefreshing,
      trackError,
      refreshTrack,
      progress,
      progressLoading,
      progressRefreshing,
      progressError,
      refreshProgress,
      addDoseLog,
      addWeightLog,
      addMeasurement,
      addSideEffectLog,
      addMeal,
    }),
    [
      home,
      homeLoading,
      homeRefreshing,
      homeError,
      refreshHome,
      bumpProtein,
      bumpWater,
      track,
      trackLoading,
      trackRefreshing,
      trackError,
      refreshTrack,
      progress,
      progressLoading,
      progressRefreshing,
      progressError,
      refreshProgress,
      addDoseLog,
      addWeightLog,
      addMeasurement,
      addSideEffectLog,
      addMeal,
    ],
  );

  return <PeptaDataContext.Provider value={value}>{children}</PeptaDataContext.Provider>;
}

export function usePeptaData(): PeptaDataContextValue {
  const value = useContext(PeptaDataContext);
  if (!value) {
    throw new Error('usePeptaData must be used within PeptaDataProvider');
  }
  return value;
}
