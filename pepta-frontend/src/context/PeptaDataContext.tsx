import React, { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { HomeResponse, ProgressResponse, TrackResponse } from '@pepta/shared';
import { api } from '../services/api';

interface PeptaDataContextValue {
  home: HomeResponse | null;
  track: TrackResponse | null;
  progress: ProgressResponse | null;
  refreshHome(): Promise<void>;
  refreshTrack(): Promise<void>;
  refreshProgress(): Promise<void>;
}

const PeptaDataContext = createContext<PeptaDataContextValue | undefined>(undefined);

export function PeptaDataProvider({ children }: { children: ReactNode }) {
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [track, setTrack] = useState<TrackResponse | null>(null);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);

  const refreshHome = useCallback(async () => {
    setHome(await api.getHome());
  }, []);

  const refreshTrack = useCallback(async () => {
    setTrack(await api.getTrack());
  }, []);

  const refreshProgress = useCallback(async () => {
    setProgress(await api.getProgress());
  }, []);

  const value = useMemo<PeptaDataContextValue>(
    () => ({ home, track, progress, refreshHome, refreshTrack, refreshProgress }),
    [home, progress, refreshHome, refreshProgress, refreshTrack, track],
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
