// Persistence for "What to show".
//
// THE SERVER IS THE SOURCE OF TRUTH, so the choice follows the user to a
// second device and survives a reinstall. It rides its own endpoint rather
// than the profile, because userProfileResponseSchema is .strict() and a new
// key there is rejected outright by every shipped build.
//
// LOCAL STORAGE STAYS, AS A CACHE. The screen must paint on arrival rather
// than after a round trip, and hiding a card has to keep working on a train
// with no signal. So: read the cache first, let the server correct it, and
// write both on every toggle.
//
// SERVER WINS ON CONFLICT, and that is the honest rule for a display
// preference — it is the only value that both devices can see. The cost of
// being wrong is one card visible that someone hid on their phone twenty
// minutes ago, which the next toggle fixes.
//
// There is no Save button, so every toggle writes. A failed write costs the
// preference, never the interaction.

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../../services/api';
import {
  ALL_SECTIONS_ON,
  PROGRESS_SECTIONS,
  PROGRESS_SECTIONS_KEY,
  parseSectionPrefs,
  toggleSection,
  type ProgressSectionKey,
  type ProgressSectionPrefs,
} from './progressSections';

export interface UseProgressSections {
  sections: ProgressSectionPrefs;
  toggle: (key: ProgressSectionKey) => void;
  /** False until the cache has been read. */
  hydrated: boolean;
}

/** Only known sections cross the wire — the record type would take anything. */
function toWire(prefs: ProgressSectionPrefs): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const section of PROGRESS_SECTIONS) out[section.key] = prefs[section.key];
  return out;
}

export function useProgressSections(): UseProgressSections {
  const [sections, setSections] = useState<ProgressSectionPrefs>(ALL_SECTIONS_ON);
  const [hydrated, setHydrated] = useState(false);
  const alive = useRef(true);
  /**
   * True once the user has touched a switch this session. A server response
   * landing after that must not undo it — the tap is newer than the fetch it
   * raced, whatever order they arrive in.
   */
  const touched = useRef(false);
  /**
   * Current prefs, readable synchronously. The writes below must happen once
   * per tap: React double-invokes state updaters in StrictMode, so a request
   * fired from inside one goes out twice.
   */
  const current = useRef<ProgressSectionPrefs>(ALL_SECTIONS_ON);

  useEffect(() => {
    alive.current = true;

    AsyncStorage.getItem(PROGRESS_SECTIONS_KEY)
      .then((raw) => {
        if (!alive.current || touched.current) return;
        current.current = parseSectionPrefs(raw);
        setSections(current.current);
      })
      // Unreadable storage means everything on, which is the safe way to be
      // wrong: a screen showing too much is recoverable, one hiding a card the
      // user never hid is not obviously anything.
      .catch(() => undefined)
      .finally(() => {
        if (alive.current) setHydrated(true);
      });

    api
      .getUiPreferences()
      .then((response) => {
        if (!alive.current || touched.current) return;
        const stored = response.preferences.progressSections;
        // An account that has never saved preferences must not blank the
        // cache — an empty object is "nothing chosen", not "all off".
        if (Object.keys(stored).length === 0) return;
        current.current = parseSectionPrefs(JSON.stringify(stored));
        setSections(current.current);
        void AsyncStorage.setItem(PROGRESS_SECTIONS_KEY, JSON.stringify(stored)).catch(
          () => undefined,
        );
      })
      .catch(() => undefined);

    return () => {
      alive.current = false;
    };
  }, []);

  const toggle = useCallback((key: ProgressSectionKey) => {
    touched.current = true;
    const next = toggleSection(current.current, key);
    current.current = next;
    setSections(next);

    const wire = toWire(next);
    // Both, fire and forget. The screen has already changed; a failed write
    // costs the preference at next launch, not the tap now.
    void AsyncStorage.setItem(PROGRESS_SECTIONS_KEY, JSON.stringify(wire)).catch(() => undefined);
    void api.putUiPreferences({ progressSections: wire }).catch(() => undefined);
  }, []);

  return { sections, toggle, hydrated };
}
