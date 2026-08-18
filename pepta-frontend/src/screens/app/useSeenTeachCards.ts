// Local state for Pep's daily lesson: which entries have been taught, and
// which card the user folded away today.
//
// SEEN is permanent — a dismissed lesson never comes back, because the fastest
// way to make "tiny daily learning" feel like nagging is to repeat yourself.
//
// THE FOLD IS FOR TODAY ONLY, and it has to be persisted rather than kept in
// component state: a fold that evaporated on the next Home refresh would let
// the picker hand back a different card seconds after the user said "not now".
// It is stored with the local day it was made, so it lapses at midnight and
// tomorrow's lesson opens on its own.
//
// Device-local on purpose: this is presentation state, not health data, and it
// carries no value worth a server round-trip or a schema field.

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TeachFold } from './pepTeach';

/** Versioned so the list can be reset deliberately if the library is reworked. */
export const TEACH_SEEN_KEY = 'pepta:pep-taught.v1';
export const TEACH_FOLD_KEY = 'pepta:pep-folded.v1';

/** Parse defensively: a corrupt blob reads as "nothing folded", never a throw. */
export function parseFold(raw: string | null): TeachFold | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { entryId, day, collapsed } = parsed as Record<string, unknown>;
    if (typeof entryId !== 'string' || typeof day !== 'string') return null;
    if (entryId.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    if (typeof collapsed !== 'boolean') return null;
    return { entryId, day, collapsed };
  } catch {
    return null;
  }
}

/** Keeps the tail only — the library is finite and old ids stop mattering. */
const MAX_REMEMBERED = 60;

export function useSeenTeachCards(): {
  seen: string[];
  markSeen: (entryId: string) => void;
  fold: TeachFold | null;
  setFold: (fold: TeachFold | null) => void;
} {
  const [seen, setSeen] = useState<string[]>([]);
  const [fold, setFoldState] = useState<TeachFold | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.getItem(TEACH_SEEN_KEY),
      AsyncStorage.getItem(TEACH_FOLD_KEY),
    ])
      .then(([seenRaw, foldRaw]) => {
        if (!active) return;
        if (seenRaw) {
          const parsed: unknown = JSON.parse(seenRaw);
          // A corrupt or hand-edited blob reads as "nothing seen" rather than
          // throwing — the worst case is one repeated lesson.
          if (Array.isArray(parsed)) {
            setSeen(parsed.filter((v): v is string => typeof v === 'string'));
          }
        }
        setFoldState(parseFold(foldRaw));
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) hydrated.current = true;
      });
    return () => {
      active = false;
    };
  }, []);

  const setFold = useCallback((next: TeachFold | null) => {
    setFoldState(next);
    const write = next
      ? AsyncStorage.setItem(TEACH_FOLD_KEY, JSON.stringify(next))
      : AsyncStorage.removeItem(TEACH_FOLD_KEY);
    write.catch(() => undefined);
  }, []);

  const markSeen = useCallback((entryId: string) => {
    setSeen((current) => {
      if (current.includes(entryId)) return current;
      const next = [...current, entryId].slice(-MAX_REMEMBERED);
      AsyncStorage.setItem(TEACH_SEEN_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  return { seen, markSeen, fold, setFold };
}
