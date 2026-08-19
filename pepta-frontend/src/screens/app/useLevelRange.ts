// Fetching for the medication-level range control.
//
// PREFETCHED, so tapping a window is instant. The alternative was a spinner on
// every first tap of Month, 90d and All — and because a half-loaded window
// must never draw the week's curve under a wider label, that spinner sat over
// an empty frame. Three small requests on arrival buy all four windows.
//
// A background fetch is deliberately quieter than a chosen one: it never sets
// `loading` (there is nothing the user is waiting for) and never sets `failed`
// (there is nothing to tell them about a window they have not asked for). If
// it failed and they then tap that window, the tap fetches it properly and
// reports properly.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LevelRangeKey, MedicationLevelsResponse } from '@pepta/shared';
import { api } from '../../services/api';

/** Everything except week, which /home already carries. */
const PREFETCHED: readonly LevelRangeKey[] = ['month', 'quarter', 'all'];

export interface UseLevelRange {
  range: LevelRangeKey;
  setRange: (next: LevelRangeKey) => void;
  fetched: Partial<Record<LevelRangeKey, MedicationLevelsResponse>>;
  loading: boolean;
  /** The range whose fetch failed, so the card can say so instead of spinning. */
  failed: LevelRangeKey | null;
  retry: () => void;
}

export function useLevelRange({ enabled }: { enabled: boolean }): UseLevelRange {
  const [range, setRangeState] = useState<LevelRangeKey>('week');
  const [fetched, setFetched] = useState<Partial<Record<LevelRangeKey, MedicationLevelsResponse>>>(
    {},
  );
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<LevelRangeKey | null>(null);
  const alive = useRef(true);
  /**
   * What has been fetched, readable synchronously. A ref rather than reading
   * the state inside a setState updater: updaters must be pure, and StrictMode
   * double-invokes them — a request fired from inside one goes out twice.
   */
  const held = useRef<Partial<Record<LevelRangeKey, MedicationLevelsResponse>>>({});
  /** In flight right now, so a prefetch and a tap cannot both request one. */
  const inFlight = useRef(new Set<LevelRangeKey>());
  // The range the user is actually looking at. A slow Month landing after they
  // have moved on to 90d must not flip the chart under them.
  const wanted = useRef<LevelRangeKey>('week');

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback((next: LevelRangeKey, background: boolean) => {
    if (next === 'week') return; // /home already has it
    if (held.current[next] || inFlight.current.has(next)) return;
    inFlight.current.add(next);
    if (!background) {
      setLoading(true);
      setFailed(null);
    }
    api
      .getMedicationLevels(next)
      .then((response) => {
        inFlight.current.delete(next);
        if (!alive.current) return;
        // Stored whoever asked for it: a prefetch that lands while the user is
        // elsewhere is exactly the point.
        held.current = { ...held.current, [next]: response };
        setFetched(held.current);
        if (wanted.current === next) setLoading(false);
      })
      .catch(() => {
        inFlight.current.delete(next);
        if (!alive.current) return;
        // A window nobody asked for failing is not news. It will be refetched
        // if they tap it, and reported then.
        if (background || wanted.current !== next) return;
        setLoading(false);
        setFailed(next);
      });
  }, []);

  // Warms the other three once there is a curve to window at all. A user with
  // no doses logged has nothing to prefetch.
  useEffect(() => {
    if (!enabled) return;
    for (const key of PREFETCHED) load(key, true);
  }, [enabled, load]);

  const setRange = useCallback(
    (next: LevelRangeKey) => {
      wanted.current = next;
      setRangeState(next);
      setFailed(null);
      if (held.current[next]) {
        setLoading(false);
        return; // already warm — this is the whole point of the prefetch
      }
      load(next, false);
      // Already in flight from the prefetch: adopt the wait rather than firing
      // a second request for the same window.
      if (inFlight.current.has(next)) setLoading(true);
    },
    [load],
  );

  const retry = useCallback(() => {
    setFailed(null);
    load(wanted.current, false);
  }, [load]);

  return { range, setRange, fetched, loading, failed, retry };
}
