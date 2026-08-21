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
import { api, type DeletableLogKind } from "../services/api";
import { pickLogToUndo, type UndoableLog } from "../utils/undoBump";
import { useAuth } from "./AuthContext";
import { readSnapshot, writeSnapshot } from "../services/peptaSnapshotStore";
import {
  outboxCount,
  replayOutbox,
  saveLogDurably,
  type OutboxKind,
  type SaveResult,
} from "../services/mutationOutbox";
import { AppState } from "react-native";
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
  /**
   * Durable log save: tries now, queues on offline/5xx (resolving "queued"),
   * throws only for final rejections. Queued logs replay automatically on
   * foreground/sign-in; the server dedupes by idempotency key, so replays can
   * never create duplicates.
   */
  saveLog(kind: OutboxKind, payload: Record<string, unknown>): Promise<SaveResult>;
  /** How many logs are waiting to reach the server. */
  pendingLogs: number;
  /** When data on screen last came from the server (or the cache's savedAt). */
  lastSyncedAt: string | null;
  refreshProgress(sinceDays?: number): Promise<void>;
  addCompound(input: CompoundInput): Promise<CompoundResponse>;
  // Optimistic inserts for the QuickLog sheet (prepend a temp row; the next
  // refresh reconciles to server truth).
  addDoseLog(input: DoseLogInput): void;
  addWeightLog(input: WeightLogInput): void;
  addMeasurement(input: MeasurementInput): void;
  addSideEffectLog(input: SideEffectLogInput): void;
  // Optimistically fold a logged meal into today's Home macro totals.
  addMeal(input: MealLogInput): void;
  /**
   * Soft-deletes one log and rolls back if the server refuses. Resolves true
   * when it stuck. The delete routes have always existed; nothing called them.
   */
  deleteLog(kind: DeletableLogKind, id: string): Promise<boolean>;
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
    weightLogs: [],
    fiberLogs: [],
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
  /**
   * The current track payload, readable synchronously. Rollback has to capture
   * what was on screen at the moment of the delete; reading state inside a
   * setState updater captures whatever a concurrent write left behind.
   */
  const trackRef = useRef<TrackResponse | null>(null);
  trackRef.current = track;
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackRefreshing, setTrackRefreshing] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<ScheduleResponse[] | null>(null);
  const [cycles, setCycles] = useState<CycleResponse[] | null>(null);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressRefreshing, setProgressRefreshing] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [pendingLogs, setPendingLogs] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const hasData = useRef(false);
  const hasTrack = useRef(false);
  const hasProgress = useRef(false);
  // The server window Progress last asked for (days; Infinity = everything).
  // Undefined until a range is chosen — the server's default window applies.
  const progressWindowRef = useRef<number | undefined>(undefined);

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
  const saveLogRef = useRef<(kind: OutboxKind, payload: Record<string, unknown>) => Promise<SaveResult>>(
    async () => "saved",
  );
  // Same reason as saveLogRef: the bump callbacks are defined above the real
  // implementations, and reaching them through a ref keeps the declaration
  // order intact without restructuring the provider.
  const deleteLogRef = useRef<
    (kind: DeletableLogKind, id: string) => Promise<boolean>
  >(async () => false);
  const refreshTrackRef = useRef<() => Promise<void>>(async () => undefined);
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
    setPendingLogs(0);
    setLastSyncedAt(null);
    progressWindowRef.current = undefined;
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
        setLastSyncedAt(new Date().toISOString());
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

  // A minus tap is an undo of a plus tap, so it deletes the log the plus tap
  // created rather than pretending. Before this, minus decremented the on-screen
  // total and returned early — the number moved, nothing was persisted, and the
  // next refresh silently restored the old total.
  //
  // Nothing to undo (no matching log today) is a genuine no-op: the displayed
  // total stays put, which is the truth. See pickLogToUndo for why the match is
  // exact-amount.
  const undoBump = useCallback(
    async <T extends UndoableLog>(
      kind: DeletableLogKind,
      rowsOf: (track: TrackResponse) => readonly T[],
      amount: number,
      amountOf: (row: T) => number,
      applyDelta: (delta: number) => void,
    ): Promise<void> => {
      const epoch = sessionEpoch.current;
      let current = trackRef.current;
      if (!current) {
        // Home is often the first screen touched, so Track may never have
        // loaded. Without the rows there is nothing to match against.
        await refreshTrackRef.current();
        if (epoch !== sessionEpoch.current) return;
        current = trackRef.current;
      }
      if (!current) return;

      const target = pickLogToUndo(rowsOf(current), amount, amountOf);
      if (!target) return;

      applyDelta(-amount);
      const deleted = await deleteLogRef.current(kind, target.id);
      // deleteLog refreshes home on success, so truth replaces the optimistic
      // number shortly after. Only a failure needs putting back.
      if (!deleted && epoch === sessionEpoch.current) applyDelta(amount);
    },
    [],
  );

  // Optimistic inline-stepper bumps. We update the on-screen total immediately,
  // then persist the delta — a plus as a new log, a minus as a deletion of the
  // log it undoes. On a failed write we revert.
  const bumpProtein = useCallback(
    (grams: number) => {
      const applyDelta = (delta: number) =>
        setHome((h) =>
          h
            ? updateRangeTotals(
                {
                  ...h,
                  todayProteinGrams: Math.max(0, h.todayProteinGrams + delta),
                },
                {
                  proteinGrams: Math.max(
                    0,
                    (h.rangeTotals?.proteinGrams ?? h.todayProteinGrams) + delta,
                  ),
                },
              )
            : h,
        );
      if (grams < 0) {
        void undoBump(
          "protein",
          (t) => t.proteinLogs,
          -grams,
          (row) => row.grams,
          applyDelta,
        );
        return;
      }
      if (grams === 0) return;
      const epoch = sessionEpoch.current;
      applyDelta(grams);
      // Durable: offline/5xx queues the log (optimistic total stays — the log
      // WILL land); only a final server rejection reverts the total.
      saveLogRef
        .current("protein", { grams, datetime: new Date().toISOString() })
        .catch(() => {
          if (epoch !== sessionEpoch.current) return;
          applyDelta(-grams);
        });
    },
    [undoBump, updateRangeTotals],
  );
  const bumpWater = useCallback(
    (oz: number) => {
      const applyDelta = (delta: number) =>
        setHome((h) =>
          h
            ? updateRangeTotals(
                { ...h, todayWaterOz: Math.max(0, h.todayWaterOz + delta) },
                {
                  waterOz: Math.max(
                    0,
                    (h.rangeTotals?.waterOz ?? h.todayWaterOz) + delta,
                  ),
                },
              )
            : h,
        );
      if (oz < 0) {
        void undoBump(
          "water",
          (t) => t.waterLogs,
          -oz,
          (row) => row.amountOz,
          applyDelta,
        );
        return;
      }
      if (oz === 0) return;
      const epoch = sessionEpoch.current;
      applyDelta(oz);
      saveLogRef
        .current("water", { amountOz: oz, datetime: new Date().toISOString() })
        .catch(() => {
          if (epoch !== sessionEpoch.current) return;
          applyDelta(-oz);
        });
    },
    [undoBump, updateRangeTotals],
  );
  const bumpFiber = useCallback(
    (grams: number) => {
      const applyDelta = (delta: number) =>
        setHome((h) =>
          h
            ? updateRangeTotals(
                {
                  ...h,
                  todayFiberGrams: Math.max(0, h.todayFiberGrams + delta),
                },
                {
                  fiberGrams: Math.max(
                    0,
                    (h.rangeTotals?.fiberGrams ?? h.todayFiberGrams) + delta,
                  ),
                },
              )
            : h,
        );
      if (grams < 0) {
        void undoBump(
          "fiber",
          (t) => t.fiberLogs ?? [],
          -grams,
          (row) => row.grams,
          applyDelta,
        );
        return;
      }
      if (grams === 0) return;
      const epoch = sessionEpoch.current;
      applyDelta(grams);
      saveLogRef
        .current("fiber", { grams, datetime: new Date().toISOString() })
        .catch(() => {
          if (epoch !== sessionEpoch.current) return;
          applyDelta(-grams);
        });
    },
    [undoBump, updateRangeTotals],
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
  /**
   * Removes one log, optimistically.
   *
   * MARKS deletedAt RATHER THAN SPLICING THE ROW OUT. Every consumer already
   * filters on it — the whole soft-delete guard exists for this moment — and
   * a marked row rolls back by clearing one field, where a spliced one has to
   * be put back in the right place in the right array.
   *
   * The rollback value is captured from a ref, synchronously. Reading it
   * inside the setState updater would capture whatever a concurrent write had
   * already done.
   */
  const deleteLog = useCallback(
    async (kind: DeletableLogKind, id: string): Promise<boolean> => {
      // Session epoch, like every other async writer in this file. Without it
      // this rollback was the one path that could restore a PREVIOUS account's
      // feed into the current session — and the snapshot write-through then
      // persisted it to the new account's on-device cache. A delete that fails
      // after the user has signed out has nothing left to roll back to.
      const epoch = sessionEpoch.current;
      const before = trackRef.current;
      const mark = <T extends { id: string; deletedAt?: string | null }>(rows: T[]) =>
        rows.map((row) => (row.id === id ? { ...row, deletedAt: new Date().toISOString() } : row));

      setTrack((t) =>
        t
          ? {
              ...t,
              doseLogs: mark(t.doseLogs),
              mealLogs: mark(t.mealLogs),
              waterLogs: mark(t.waterLogs),
              proteinLogs: mark(t.proteinLogs),
              activityLogs: mark(t.activityLogs),
              sideEffectLogs: mark(t.sideEffectLogs),
              weightLogs: mark(t.weightLogs),
              measurements: mark(t.measurements),
              fiberLogs: mark(t.fiberLogs ?? []),
            }
          : t,
      );

      try {
        await api.deleteLog(kind, id);
        if (epoch !== sessionEpoch.current) return false;
        // Totals, streaks and the level curve are all server-derived, so the
        // row vanishing locally is only half of it.
        void refreshHome();
        void refreshTrack();
        return true;
      } catch {
        if (epoch !== sessionEpoch.current) return false;
        setTrack(before);
        return false;
      }
    },
    [refreshHome, refreshTrack],
  );

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

  const refreshProgress = useCallback(async (sinceDays?: number) => {
    const epoch = sessionEpoch.current;
    if (sinceDays != null) progressWindowRef.current = sinceDays;
    setProgressError(null);
    if (hasProgress.current) setProgressRefreshing(true);
    else setProgressLoading(true);
    try {
      const data = await api.getProgress(progressWindowRef.current);
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

  // ── Durable log outbox ─────────────────────────────────────────────────
  // saveLog is the single write path for log mutations: try now, queue on
  // offline/5xx, throw only on final rejection. Replay fires on sign-in and
  // whenever the app returns to the foreground; the server's idempotency
  // index makes any replay safe. saveLogRef exists so the bump callbacks
  // above (declared earlier) can reach it without a use-before-declare.
  const refreshOutboxCount = useCallback(async () => {
    if (!userId) return;
    const count = await outboxCount(userId);
    setPendingLogs((current) => (current === count ? current : count));
  }, [userId]);

  const saveLog = useCallback(
    async (kind: OutboxKind, payload: Record<string, unknown>): Promise<SaveResult> => {
      if (!userId) throw new Error("saveLog requires a signed-in user");
      const result = await saveLogDurably(userId, kind, payload);
      if (result === "queued") void refreshOutboxCount();
      return result;
    },
    [userId, refreshOutboxCount],
  );

  saveLogRef.current = saveLog;
  deleteLogRef.current = deleteLog;
  refreshTrackRef.current = refreshTrack;

  const runReplay = useCallback(async () => {
    if (!userId) return;
    const epoch = sessionEpoch.current;
    const result = await replayOutbox(userId);
    if (epoch !== sessionEpoch.current) return;
    setPendingLogs(result.remaining);
    if (result.sent > 0) {
      // Queued logs just landed: pull server truth so totals include them.
      const { refreshHome: rh, refreshTrack: rt, refreshProgress: rp } = refreshersRef.current;
      void rh();
      void rt();
      void rp();
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    void refreshOutboxCount();
    void runReplay();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void runReplay();
    });
    return () => subscription.remove();
  }, [userId, refreshOutboxCount, runReplay]);

  // FOREGROUND DRAIN. The two triggers above are sign-in and
  // background→active, so a log that queued while the user was sitting in the
  // app had nothing to retry it: the queue stayed put, and the header kept
  // claiming the log was waiting for connectivity that was there the whole
  // time. A single slow request (the 15s timeout counts) could strand a log
  // until the user happened to leave the app and come back.
  //
  // Backoff, not a poll: 5s, then doubling to a 60s ceiling, and only while
  // something is actually queued. Any new queued log re-runs this effect and
  // resets the delay, so the common case retries quickly.
  useEffect(() => {
    if (!userId || pendingLogs === 0) return undefined;
    let cancelled = false;
    let delayMs = 5_000;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      void runReplay().finally(() => {
        if (cancelled) return;
        delayMs = Math.min(delayMs * 2, 60_000);
        timer = setTimeout(tick, delayMs);
      });
    };
    timer = setTimeout(tick, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userId, pendingLogs, runReplay]);

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
  const refreshersRef = useRef({ refreshHome, refreshTrack, refreshProgress, refreshScheduling });
  refreshersRef.current = { refreshHome, refreshTrack, refreshProgress, refreshScheduling };

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
      // Scheduling too: a null schedule means "we don't know if a dose is due",
      // which is why Home shows the log button. Hydrating it stops the button
      // flashing on and off on every cold start for a user who isn't due.
      if (snapshot.schedules) setSchedules((s) => s ?? snapshot.schedules);
      if (snapshot.cycles) setCycles((c) => c ?? snapshot.cycles);
      if (snapshot.home) hasData.current = true;
      if (snapshot.track) hasTrack.current = true;
      if (snapshot.progress) hasProgress.current = true;
      setLastSyncedAt((at) => at ?? snapshot.savedAt);
      // Hydration makes the screens' fetch-on-null triggers see non-null, so
      // freshness is the provider's job here: kick background refreshes now.
      const { refreshHome: rh, refreshTrack: rt, refreshProgress: rp, refreshScheduling: rs } =
        refreshersRef.current;
      void rh();
      void rt();
      void rp();
      void rs();
    });
    return () => {
      alive = false;
    };
    // Depends on userId only: the refreshers are reached through the ref so a
    // homeRange change cannot re-run hydration and re-kick four fetches.
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    if (!home && !track && !progress) return;
    void writeSnapshot(userId, { home, track, progress, schedules, cycles });
  }, [userId, home, track, progress, schedules, cycles]);

  const value = useMemo<PeptaDataContextValue>(
    () => ({
      saveLog,
      pendingLogs,
      lastSyncedAt,
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
      deleteLog,
    }),
    [
      saveLog,
      pendingLogs,
      lastSyncedAt,
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
      deleteLog,
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
