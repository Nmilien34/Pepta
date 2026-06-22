// Pepta theme context. Mirrors Foster's useColors() hook approach but assembles
// the full token set (colors + shadows + the static spacing/typography/motion
// scales) into one `theme` object screens and components consume via useTheme().
//
// Light mode is the default and primary surface; dark tokens ship and can be
// driven by the OS later. We expose `mode` + `setMode` so an Account toggle can
// override the system preference.

import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import { getColors, dataColors, type ThemeColors } from './colors';
import { getShadows, type Shadows } from './shadows';
import { spacing, radii, sizes } from './spacing';
import { typography } from './typography';
import { durations, springs, scale } from './motion';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface Theme {
  isDark: boolean;
  colors: ThemeColors;
  dataColors: typeof dataColors;
  shadows: Shadows;
  spacing: typeof spacing;
  radii: typeof radii;
  sizes: typeof sizes;
  typography: typeof typography;
  motion: { durations: typeof durations; springs: typeof springs; scale: typeof scale };
}

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  setMode(mode: ThemeMode): void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function buildTheme(isDark: boolean): Theme {
  const colors = getColors(isDark);
  return {
    isDark,
    colors,
    dataColors,
    shadows: getShadows(colors.shadow),
    spacing,
    radii,
    sizes,
    typography,
    motion: { durations, springs, scale },
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('light');

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';
  const theme = useMemo(() => buildTheme(isDark), [isDark]);

  const value = useMemo<ThemeContextValue>(() => ({ theme, mode, setMode }), [theme, mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return value.theme;
}

export function useThemeMode(): { mode: ThemeMode; setMode(mode: ThemeMode): void } {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useThemeMode must be used within ThemeProvider');
  }
  return { mode: value.mode, setMode: value.setMode };
}
