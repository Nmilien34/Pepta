// Fetching for the medication-level range control.
//
// Cached per range, so a user comparing Month against 90d pays for each once.
// Week is never fetched — /home already carries it.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LevelRangeKey, MedicationLevelsResponse } from '@pepta/shared';
import { api } from '../../services/api';

export interface UseLevelRange {
  range: LevelRangeKey;
  setRange: (next: LevelRangeKey) => void;
  fetched: Partial<Record<LevelRangeKey, MedicationLevelsResponse>>;
  loading: boolean;
  /** The range whose fetch failed, so the card can say so instead of spinning. */
  failed: LevelRangeKey | null;
  retry: () => void;
}

export function useLevelRange(): UseLevelRange {
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
  // The range the in-flight request is for. A slow Month landing after the
  // user has moved on to 90d must not overwrite what they are looking at.
  const wanted = useRef<LevelRangeKey>('week');

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback((next: LevelRangeKey) => {
    if (next === 'week') return; // /home already has it
    setLoading(true);
    setFailed(null);
    api
      .getMedicationLevels(next)
      .then((response) => {
        if (!alive.current || wanted.current !== next) return;
        held.current = { ...held.current, [next]: response };
        setFetched(held.current);
        setLoading(false);
      })
      .catch(() => {
        if (!alive.current || wanted.current !== next) return;
        setLoading(false);
        setFailed(next);
      });
  }, []);

  const setRange = useCallback(
    (next: LevelRangeKey) => {
      wanted.current = next;
      setRangeState(next);
      setFailed(null);
      // Already held: show it immediately and do not re-request.
      if (!held.current[next]) load(next);
    },
    [load],
  );

  const retry = useCallback(() => load(wanted.current), [load]);

  return { range, setRange, fetched, loading, failed, retry };
}
