// Pepta color tokens.
// Structure mirrors Foster's getColors(isDark) pattern, but the palette is
// Pepta's own: white base, gray components, purple/orange/green/blue/magenta
// accents (see Design & Frontend Master Prompt §3A). Light mode is primary and
// perfected first; dark tokens ship alongside it.

// Accent + data-type colors are shared across themes. Each data type owns a
// color so the eye learns the app ("color-coded cognition").
const accents = {
  // Brand / medication / level
  primary: '#7C5CFC',
  primaryGradientStart: '#8B6CFF',
  primaryGradientEnd: '#C77DFF',
  // Data-type colors
  protein: '#FF8A3D', // orange — also streak
  streak: '#FF8A3D',
  fiber: '#34C759', // green — also success
  success: '#34C759',
  water: '#2FA8FF', // blue — also medication level secondary
  level: '#2FA8FF',
  weight: '#E25CC4', // magenta — also goal
  goal: '#E25CC4',
  // Status
  warning: '#FFB020', // amber
  danger: '#FF4D4F', // red
  // Body map
  bodyMapFill: '#C9D2F2',
  bodyMapOutline: '#0E0E12',
} as const;

interface SemanticColors {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  fillPrimary: string;
  fillSecondary: string;
  shadow: string;
  onPrimary: string;
}

const lightColors: SemanticColors = {
  bg: '#FAFAFB',
  surface: '#FFFFFF',
  surfaceAlt: '#F2F3F5',
  border: '#ECECEF',
  textPrimary: '#0E0E12',
  textSecondary: '#6B6B76',
  textTertiary: '#A1A1AC',
  // Subtle tinted fills for inset rows / steppers, keyed off the gray scale.
  fillPrimary: 'rgba(14,14,18,0.06)',
  fillSecondary: 'rgba(14,14,18,0.04)',
  // Soft shadow color (large blur, low opacity).
  shadow: 'rgba(17,17,26,0.06)',
  // Color on top of the primary gradient / colored buttons.
  onPrimary: '#FFFFFF',
} as const;

const darkColors: SemanticColors = {
  bg: '#0E0E12',
  surface: '#17171C',
  surfaceAlt: '#1F1F26',
  border: 'rgba(255,255,255,0.08)',
  textPrimary: '#F5F5F7',
  textSecondary: '#A1A1AC',
  textTertiary: '#6B6B76',
  fillPrimary: 'rgba(255,255,255,0.08)',
  fillSecondary: 'rgba(255,255,255,0.04)',
  shadow: 'rgba(0,0,0,0.4)',
  onPrimary: '#FFFFFF',
};

export function getColors(isDark: boolean) {
  return {
    ...(isDark ? darkColors : lightColors),
    ...accents,
  };
}

// Map a Pepta data type to its owning accent color (color-coded cognition).
export const dataColors = {
  medication: accents.primary,
  level: accents.level,
  protein: accents.protein,
  fiber: accents.fiber,
  water: accents.water,
  weight: accents.weight,
  goal: accents.goal,
  streak: accents.streak,
} as const;

export type ThemeColors = ReturnType<typeof getColors>;
export type DataColorKey = keyof typeof dataColors;
