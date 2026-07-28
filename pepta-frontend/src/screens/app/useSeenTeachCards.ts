// Which library entries Pep has already taught. Persisted so a dismissed
// lesson never comes back — the fastest way to make a "tiny daily learning"
// feature feel like nagging is to repeat yourself.
//
// Device-local on purpose: this is presentation state, not health data, and it
// carries no value worth a server round-trip or a schema field.

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Versioned so the list can be reset deliberately if the library is reworked. */
export const TEACH_SEEN_KEY = 'pepta:pep-taught.v1';

/** Keeps the tail only — the library is finite and old ids stop mattering. */
const MAX_REMEMBERED = 60;

export function useSeenTeachCards(): {
  seen: string[];
  markSeen: (entryId: string) => void;
} {
  const [seen, setSeen] = useState<string[]>([]);
  const hydrated = useRef(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(TEACH_SEEN_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        // A corrupt or hand-edited blob reads as "nothing seen" rather than
        // throwing — the worst case is one repeated lesson.
        if (Array.isArray(parsed)) {
          setSeen(parsed.filter((v): v is string => typeof v === 'string'));
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) hydrated.current = true;
      });
    return () => {
      active = false;
    };
  }, []);

  const markSeen = useCallback((entryId: string) => {
    setSeen((current) => {
      if (current.includes(entryId)) return current;
      const next = [...current, entryId].slice(-MAX_REMEMBERED);
      AsyncStorage.setItem(TEACH_SEEN_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  return { seen, markSeen };
}
