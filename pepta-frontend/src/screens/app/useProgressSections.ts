// Persistence for "What to show".
//
// ON THE DEVICE, not the profile: this is a display choice, and putting it on
// the server would make "hide Weight" indistinguishable from "the server
// stopped returning weights" the next time something went wrong.
//
// Written on every toggle rather than on a Save button, because the sheet has
// no Save button — the frame's rows switch and the screen behind them changes.

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ALL_SECTIONS_ON,
  PROGRESS_SECTIONS_KEY,
  parseSectionPrefs,
  toggleSection,
  type ProgressSectionKey,
  type ProgressSectionPrefs,
} from './progressSections';

export interface UseProgressSections {
  sections: ProgressSectionPrefs;
  toggle: (key: ProgressSectionKey) => void;
  /** False until the stored value has been read. */
  hydrated: boolean;
}

export function useProgressSections(): UseProgressSections {
  const [sections, setSections] = useState<ProgressSectionPrefs>(ALL_SECTIONS_ON);
  const [hydrated, setHydrated] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    AsyncStorage.getItem(PROGRESS_SECTIONS_KEY)
      .then((raw) => {
        if (!alive.current) return;
        setSections(parseSectionPrefs(raw));
        setHydrated(true);
      })
      .catch(() => {
        // Unreadable storage means everything on, which is the safe way to be
        // wrong: a screen showing too much is recoverable, one hiding a card
        // the user never hid is not obviously anything.
        if (alive.current) setHydrated(true);
      });
    return () => {
      alive.current = false;
    };
  }, []);

  const toggle = useCallback((key: ProgressSectionKey) => {
    setSections((prior) => {
      const next = toggleSection(prior, key);
      // Fire and forget: the screen has already changed, and a failed write
      // costs the preference at next launch, not the interaction now.
      void AsyncStorage.setItem(PROGRESS_SECTIONS_KEY, JSON.stringify(next)).catch(
        () => undefined,
      );
      return next;
    });
  }, []);

  return { sections, toggle, hydrated };
}
