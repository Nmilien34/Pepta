// Pepta data layer. Home is a single aggregated endpoint (GET /home →
// HomeResponse with built-in sectionErrors), so we don't fan out like Leanient —
// one fetch, with first-load vs pull-to-refresh + error state (Leanient's
// isLoading / isRefreshing / homeError shape). Inline steppers update
// optimistically; positive deltas are persisted as append-only log rows and the
// next refresh reconciles to server truth.

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
import type {
  CompoundInput,
  CompoundResponse,
  CycleInput,
  CycleResponse,
  DoseLogInput,
  DoseLogResponse,
  HomeRangeKey,
  HomeResponse,
  MealLogInput,
  MealLogResponse,
  MeasurementInput,
  MeasurementResponse,
  ProgressResponse,
  ScheduleResponse,
  SideEffectLogInput,
  SideEffectLogResponse,
  TrackResponse,
  WeightLogInput,
  WeightLogResponse,
} from "@pepta/shared";
import { api } from "../services/api";
import { useAuth } from "./AuthContext";
import { readSnapshot, writeSnapshot } from "../services/peptaSnapshotStore";
import { hasAIDataSharingConsent } from "../services/aiConsent";
import { extractApiError, isOffline } from "../services/apiError";

type RangeTotalPatch = Partial<
  Pick<
    NonNullable<HomeResponse["rangeTotals"]>,
    "proteinGrams" | "fiberGrams" | "waterOz" | "calories"
  >
>;

// Build a throwaway optimistic record from a log input (temp id; replaced by the
// real row on the next refresh). Cast is safe — it's local-only, never validated.
function optimisticRow<T>(input: object): T {
  return {
    ...input,
    id: `temp-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    userId: "me",
    deletedAt: null,
    createdAt:
      (input as { datetime?: string }).datetime ?? new Date().toISOString(),
    updatedAt:
      (input as { datetime?: string }).datetime ?? new Date().toISOString(),
  } as T;
}

interface PeptaDataContextValue {
  home: HomeResponse | null;
  homeLoading: boolean; // first load (no data yet)
  homeRefreshing: boolean; // pull-to-refresh (data already shown)
  homeError: string | null;
  homeRange: HomeRangeKey;
  refreshHome(range?: HomeRangeKey): Promise<void>;
  // Optimistic inline-stepper updates (Home water/protein).
  bumpProtein(grams: number): void;
  bumpWater(oz: number): void;
  bumpFiber(grams: number): void;
  track: TrackResponse | null;
  trackLoading: boolean;
  trackRefreshing: boolean;
  trackError: string | null;
  refreshTrack(): Promise<void>;
  // Scheduling (Track week strip, month sheet, cycle setup). Loaded lazily by
  // the Track screen; null until the first fetch resolves. Failures leave them
  // null — the strip and pill simply don't render, matching the screen's
  // render-whatever-loaded posture.
  schedules: ScheduleResponse[] | null;
  cycles: CycleResponse[] | null;
  refreshScheduling(): Promise<void>;
  // The cycles router has no PATCH: editing = soft-delete the old row, create
  // the new one. Sequenced create-first so a failed create never leaves the
  // user with no cycle at all.
  saveCycle(input: CycleInput, replaceId?: string): Promise<CycleResponse>;
  progress: ProgressResponse | null;
  progressLoading: boolean;
  progressRefreshing: boolean;
  progressError: string | null;
  refreshProgress(): Promise<void>;
  addCompound(input: CompoundInput): Promise<CompoundResponse>;
  // Optimistic inserts for the QuickLog sheet (prepend a temp row; the next
  // refresh reconciles to server truth).
  addDoseLog(input: DoseLogInput): void;
  addWeightLog(input: WeightLogInput): void;
  addMeasurement(input: MeasurementInput): void;
  addSideEffectLog(input: SideEffectLogInput): void;
  // Optimistically fold a logged meal into today's Home macro totals.
  addMeal(input: MealLogInput): void;
}

const PeptaDataContext = createContext<PeptaDataContextValue | undefined>(
  undefined,
);

export function homeWithAddedCompound(
  home: HomeResponse | null,
  compound: CompoundResponse,
): HomeResponse | null {
  if (!home) return home;

  const withoutExisting = home.activeCompounds.filter(
    (item) => item.id !== compound.id,
  );

  return {
    ...home,
    activeCompounds: [compound, ...withoutExisting],
  };
}

export function homeWithLatestWeight(
  home: HomeResponse | null,
  latestWeight: WeightLogInput | WeightLogResponse,
): HomeResponse | null {
  if (!home) return home;
  const row =
    "id" in latestWeight
      ? latestWeight
      : optimisticRow<WeightLogResponse>(latestWeight);
  return {
    ...home,
    latestWeight: row,
  };
}

function emptyTrackResponse(): TrackResponse {
  return {
    doseLogs: [],
    mealLogs: [],
    waterLogs: [],
    proteinLogs: [],
    activityLogs: [],
    sideEffectLogs: [],
    measurements: [],
    sectionErrors: {},
  };
}

export function trackWithAddedSideEffect(
  track: TrackResponse | null,
  input: SideEffectLogInput,
): TrackResponse {
  const current = track ?? emptyTrackResponse();
  return {
    ...current,
    sideEffectLogs: [
      optimisticRow<SideEffectLogResponse>(input),
      ...current.sideEffectLogs,
    ],
  };
}

export function trackWithAddedMeal(
  track: TrackResponse | null,
  input: MealLogInput,
): TrackResponse {
  const current = track ?? emptyTrackResponse();
  return {
    ...current,
    mealLogs: [optimisticRow<MealLogResponse>(input), ...current.mealLogs],
  };
}

function errorMessage(error: unknown): string {
  // Branch on the typed error CODE (not message text). extractApiError pulls the
  // backend's { error: { code } } envelope; network drops/timeouts map to
  // serviceUnavailable.
  const { code, message } = extractApiError(error);
  // Always log the raw cause so it shows in the Metro/device console.
  console.warn("[PeptaData] request failed:", code, message);
  if (isOffline(error)) {
    return "Couldn’t reach Pepta — check your connection.";
  }
  // Surface the real cause (status code + message) instead of a generic message,
  // so failures are diagnosable on-device.
  return `Couldn’t load your data.\n(${message})`;
}

export function PeptaDataProvider({ children }: { children: ReactNode }) {
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeRefreshing, setHomeRefreshing] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [homeRange, setHomeRange] = useState<HomeRangeKey>("today");
  const [track, setTrack] = useState<TrackResponse | null>(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackRefreshing, setTrackRefreshing] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<ScheduleResponse[] | null>(null);
  const [cycles, setCycles] = useState<CycleResponse[] | null>(null);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressRefreshing, setProgressRefreshing] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const hasData = useRef(false);
  const hasTrack = useRef(false);
  const hasProgress = useRef(false);

  // ── Account isolation (P0) ─────────────────────────────────────────────
  // This provider mounts ONCE, above AccessGate, and used to keep its state
  // across logout/login. On a shared device, account B could briefly see
  // account A's Home/Track/Progress. The wipe below runs in the RENDER phase
  // (React's derived-state pattern), so it completes before anything paints —
  // an effect would run after paint, which is one frame too late for a
  // privacy wipe. The epoch invalidates in-flight async work: any fetch or
  // optimistic revert started under a previous account checks the epoch
  // before touching state, so a slow response can never land in the wrong
  // account's session.
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const sessionEpoch = useRef(0);
  const [boundUserId, setBoundUserId] = useState<string | null>(userId);
  if (boundUserId !== userId) {
    sessionEpoch.current += 1;
    setBoundUserId(userId);
    setHome(null);
    setHomeLoading(false);
    setHomeRefreshing(false);
    setHomeError(null);
    setHomeRange("today");
    setTrack(null);
    setTrackLoading(false);
    setTrackRefreshing(false);
    setTrackError(null);
    setSchedules(null);
    setCycles(null);
    setProgress(null);
    setProgressLoading(false);
    setProgressRefreshing(false);
    setProgressError(null);
    hasData.current = false;
    hasTrack.current = false;
    hasProgress.current = false;
  }

  const refreshHome = useCallback(
    async (range?: HomeRangeKey) => {
      const nextRange = range ?? homeRange;
      const epoch = sessionEpoch.current;
      if (range) setHomeRange(range);
      setHomeError(null);
      if (hasData.current) setHomeRefreshing(true);
      else setHomeLoading(true);
      try {
        const aiDataSharingConsent = await hasAIDataSharingConsent().catch(() => false);
        const data = await api.getHome(nextRange, { aiDataSharingConsent });
        if (epoch !== sessionEpoch.current) return;
        setHome(data);
        hasData.current = true;
      } catch (error) {
        if (epoch !== sessionEpoch.current) return;
        setHomeError(errorMessage(error));
      } finally {
        if (epoch === sessionEpoch.current) {
          setHomeLoading(false);
          setHomeRefreshing(false);
        }
      }
    },
    [homeRange],
  );

  const updateRangeTotals = useCallback(
    (homeValue: HomeResponse, patch: RangeTotalPatch) => {
      if (!homeValue.rangeTotals) return homeValue;
      return {
        ...homeValue,
        rangeTotals: {
          ...homeValue.rangeTotals,
          ...patch,
          hasData: true,
        },
      };
    },
    [],
  );

  // Optimistic inline-stepper bumps. We update the on-screen total immediately,
  // then persist a positive delta as a new log (the backend log model is
  // append-only, so a negative "− " is treated as a local correction that the
  // next refresh reconciles to server truth). On a failed POST we revert.
  const bumpProtein = useCallback(
    (grams: number) => {
      const epoch = sessionEpoch.current;
      setHome((h) =>
        h
          ? updateRangeTotals(
              {
                ...h,
                todayProteinGrams: Math.max(0, h.todayProteinGrams + grams),
              },
              {
                proteinGrams: Math.max(
                  0,
                  (h.rangeTotals?.proteinGrams ?? h.todayProteinGrams) + grams,
                ),
              },
            )
          : h,
      );
      if (grams <= 0) return;
      api
        .createProteinLog({ grams, datetime: new Date().toISOString() })
        .catch(() => {
          if (epoch !== sessionEpoch.current) return;
          setHome((h) =>
            h
              ? updateRangeTotals(
                  {
                    ...h,
                    todayProteinGrams: Math.max(0, h.todayProteinGrams - grams),
                  },
                  {
                    proteinGrams: Math.max(
                      0,
                      (h.rangeTotals?.proteinGrams ?? h.todayProteinGrams) -
                        grams,
                    ),
                  },
                )
              : h,
          );
        });
    },
    [updateRangeTotals],
  );
  const bumpWater = useCallback(
    (oz: number) => {
      const epoch = sessionEpoch.current;
      setHome((h) =>
        h
          ? updateRangeTotals(
              { ...h, todayWaterOz: Math.max(0, h.todayWaterOz + oz) },
              {
                waterOz: Math.max(
                  0,
                  (h.rangeTotals?.waterOz ?? h.todayWaterOz) + oz,
                ),
              },
            )
          : h,
      );
      if (oz <= 0) return;
      api
        .createWaterLog({ amountOz: oz, datetime: new Date().toISOString() })
        .catch(() => {
          if (epoch !== sessionEpoch.current) return;
          setHome((h) =>
            h
              ? updateRangeTotals(
                  { ...h, todayWaterOz: Math.max(0, h.todayWaterOz - oz) },
                  {
                    waterOz: Math.max(
                      0,
                      (h.rangeTotals?.waterOz ?? h.todayWaterOz) - oz,
                    ),
                  },
                )
              : h,
          );
        });
    },
    [updateRangeTotals],
  );
  const bumpFiber = useCallback(
    (grams: number) => {
      const epoch = sessionEpoch.current;
      setHome((h) =>
        h
          ? updateRangeTotals(
              { ...h, todayFiberGrams: Math.max(0, h.todayFiberGrams + grams) },
              {
                fiberGrams: Math.max(
                  0,
                  (h.rangeTotals?.fiberGrams ?? h.todayFiberGrams) + grams,
                ),
              },
            )
          : h,
      );
      if (grams <= 0) return;
      api
        .createFiberLog({ grams, datetime: new Date().toISOString() })
        .catch(() => {
          if (epoch !== sessionEpoch.current) return;
          setHome((h) =>
            h
              ? updateRangeTotals(
                  {
                    ...h,
                    todayFiberGrams: Math.max(0, h.todayFiberGrams - grams),
                  },
                  {
                    fiberGrams: Math.max(
                      0,
                      (h.rangeTotals?.fiberGrams ?? h.todayFiberGrams) - grams,
                    ),
                  },
                )
              : h,
          );
        });
    },
    [updateRangeTotals],
  );

  const refreshTrack = useCallback(async () => {
    const epoch = sessionEpoch.current;
    setTrackError(null);
    if (hasTrack.current) setTrackRefreshing(true);
    else setTrackLoading(true);
    try {
      const data = await api.getTrack();
      if (epoch !== sessionEpoch.current) return;
      setTrack(data);
      hasTrack.current = true;
    } catch (error) {
      if (epoch !== sessionEpoch.current) return;
      setTrackError(errorMessage(error));
    } finally {
      if (epoch === sessionEpoch.current) {
        setTrackLoading(false);
        setTrackRefreshing(false);
      }
    }
  }, []);

  const refreshScheduling = useCallback(async () => {
    // Progressive enhancement: a failure just keeps the previous value (or
    // null), so Track renders without the strip instead of erroring.
    const [scheduleResult, cycleResult] = await Promise.allSettled([
      api.listSchedules(),
      api.listCycles(),
    ]);
    if (scheduleResult.status === "fulfilled") setSchedules(scheduleResult.value);
    if (cycleResult.status === "fulfilled") setCycles(cycleResult.value);
    if (scheduleResult.status === "rejected") {
      console.warn(
        "[PeptaData] schedules failed:",
        extractApiError(scheduleResult.reason).message,
      );
    }
    if (cycleResult.status === "rejected") {
      console.warn(
        "[PeptaData] cycles failed:",
        extractApiError(cycleResult.reason).message,
      );
    }
  }, []);

  const saveCycle = useCallback(
    async (input: CycleInput, replaceId?: string) => {
      const created = await api.createCycle(input);
      if (replaceId) {
        // Old cycle is superseded; a failed delete leaves a duplicate active
        // row, which activeCycleOf resolves by taking the newest — so we log
        // and let the next refresh reconcile rather than failing the save.
        await api.deleteCycle(replaceId).catch((error: unknown) => {
          console.warn(
            "[PeptaData] replaced cycle delete failed:",
            extractApiError(error).message,
          );
        });
      }
      setCycles((current) => [
        created,
        ...(current ?? []).map((cycle) =>
          cycle.id === replaceId ? { ...cycle, active: false } : cycle,
        ),
      ]);
      void refreshScheduling();
      return created;
    },
    [refreshScheduling],
  );
  const addDoseLog = useCallback((input: DoseLogInput) => {
    setTrack((t) =>
      t
        ? {
            ...t,
            doseLogs: [optimisticRow<DoseLogResponse>(input), ...t.doseLogs],
          }
        : t,
    );
  }, []);
  const addSideEffectLog = useCallback((input: SideEffectLogInput) => {
    setTrack((t) => trackWithAddedSideEffect(t, input));
  }, []);
  const addWeightLog = useCallback((input: WeightLogInput) => {
    const row = optimisticRow<WeightLogResponse>(input);
    setProgress((p) =>
      p
        ? {
            ...p,
            weights: [...p.weights, row],
          }
        : p,
    );
    setHome((h) => homeWithLatestWeight(h, row));
  }, []);
  const addMeasurement = useCallback((input: MeasurementInput) => {
    setProgress((p) =>
      p
        ? {
            ...p,
            measurements: [
              optimisticRow<MeasurementResponse>(input),
              ...p.measurements,
            ],
          }
        : p,
    );
  }, []);
  const addMeal = useCallback(
    (input: MealLogInput) => {
      setTrack((t) => trackWithAddedMeal(t, input));
      setHome((h) =>
        h
          ? updateRangeTotals(
              {
                ...h,
                todayProteinGrams: h.todayProteinGrams + input.protein,
                todayCalories: h.todayCalories + input.calories,
                todayFiberGrams: h.todayFiberGrams + (input.fiber ?? 0),
              },
              {
                proteinGrams:
                  (h.rangeTotals?.proteinGrams ?? h.todayProteinGrams) +
                  input.protein,
                calories:
                  (h.rangeTotals?.calories ?? h.todayCalories) + input.calories,
                fiberGrams:
                  (h.rangeTotals?.fiberGrams ?? h.todayFiberGrams) +
                  (input.fiber ?? 0),
              },
            )
          : h,
      );
    },
    [updateRangeTotals],
  );

  const addCompound = useCallback(
    async (input: CompoundInput) => {
      const epoch = sessionEpoch.current;
      const compound = await api.createCompound(input);
      if (epoch !== sessionEpoch.current) return compound;
      setHome((h) => homeWithAddedCompound(h, compound));
      await Promise.all([refreshHome(), refreshTrack()]).catch(() => undefined);
      return compound;
    },
    [refreshHome, refreshTrack],
  );

  const refreshProgress = useCallback(async () => {
    const epoch = sessionEpoch.current;
    setProgressError(null);
    if (hasProgress.current) setProgressRefreshing(true);
    else setProgressLoading(true);
    try {
      const data = await api.getProgress();
      if (epoch !== sessionEpoch.current) return;
      setProgress(data);
      hasProgress.current = true;
    } catch (error) {
      if (epoch !== sessionEpoch.current) return;
      setProgressError(errorMessage(error));
    } finally {
      if (epoch === sessionEpoch.current) {
        setProgressLoading(false);
        setProgressRefreshing(false);
      }
    }
  }, []);

  // ── Durable last-known snapshot (per user) ────────────────────────────
  // The cache the app never had: Home/Track/Progress lived only in React
  // memory, so every cold start and every re-login began with a spinner even
  // for a user whose data was on this device minutes ago. On sign-in we
  // hydrate whatever is still empty from the user's OWN snapshot (keyed by
  // user id — account B can never read account A's cache), then immediately
  // refresh from the server in the background. hasX is set before the kick so
  // the refreshers take the quiet "refreshing" path: the user reads cached
  // data instead of watching a spinner. The snapshot is never truth — every
  // fresh payload overwrites it via the write-through effect below.
  const refreshersRef = useRef({ refreshHome, refreshTrack, refreshProgress });
  refreshersRef.current = { refreshHome, refreshTrack, refreshProgress };

  useEffect(() => {
    if (!userId) return undefined;
    const epoch = sessionEpoch.current;
    let alive = true;
    void readSnapshot(userId).then((snapshot) => {
      if (!alive || epoch !== sessionEpoch.current) return;
      if (!snapshot) return; // fresh account: screens fetch on mount as always
      // A fetch that already landed wins over the cache, always.
      setHome((h) => h ?? snapshot.home);
      setTrack((t) => t ?? snapshot.track);
      setProgress((p) => p ?? snapshot.progress);
      if (snapshot.home) hasData.current = true;
      if (snapshot.track) hasTrack.current = true;
      if (snapshot.progress) hasProgress.current = true;
      // Hydration makes the screens' fetch-on-null triggers see non-null, so
      // freshness is the provider's job here: kick background refreshes now.
      const { refreshHome: rh, refreshTrack: rt, refreshProgress: rp } = refreshersRef.current;
      void rh();
      void rt();
      void rp();
    });
    return () => {
      alive = false;
    };
    // Depends on userId only: the refreshers are reached through the ref so a
    // homeRange change cannot re-run hydration and re-kick three fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    if (!home && !track && !progress) return;
    void writeSnapshot(userId, { home, track, progress });
  }, [userId, home, track, progress]);

  const value = useMemo<PeptaDataContextValue>(
    () => ({
      home,
      homeLoading,
      homeRefreshing,
      homeError,
      homeRange,
      refreshHome,
      bumpProtein,
      bumpWater,
      bumpFiber,
      track,
      trackLoading,
      trackRefreshing,
      trackError,
      refreshTrack,
      schedules,
      cycles,
      refreshScheduling,
      saveCycle,
      progress,
      progressLoading,
      progressRefreshing,
      progressError,
      refreshProgress,
      addCompound,
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
      homeRange,
      refreshHome,
      bumpProtein,
      bumpWater,
      bumpFiber,
      track,
      trackLoading,
      trackRefreshing,
      trackError,
      refreshTrack,
      schedules,
      cycles,
      refreshScheduling,
      saveCycle,
      progress,
      progressLoading,
      progressRefreshing,
      progressError,
      refreshProgress,
      addCompound,
      addDoseLog,
      addWeightLog,
      addMeasurement,
      addSideEffectLog,
      addMeal,
    ],
  );

  return (
    <PeptaDataContext.Provider value={value}>
      {children}
    </PeptaDataContext.Provider>
  );
}

export function usePeptaData(): PeptaDataContextValue {
  const value = useContext(PeptaDataContext);
  if (!value) {
    throw new Error("usePeptaData must be used within PeptaDataProvider");
  }
  return value;
}
