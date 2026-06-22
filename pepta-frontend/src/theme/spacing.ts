// Pepta spacing, radius, and component-size tokens.
// 8pt spacing scale; card radius 24, inset/stepper radius 20, pills full.
// Screen horizontal padding 20, card padding 16–20 (Master Prompt §3C).

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,

  screen: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34, // safe area
  },
} as const;

export const radii = {
  xs: 6,
  sm: 10,
  md: 14,
  inset: 20, // inset cards, steppers
  card: 24, // primary cards
  pill: 9999, // buttons, pills, circles
} as const;

// Component-specific sizing.
export const sizes = {
  card: {
    borderRadius: radii.card,
    padding: 18,
  },
  insetCard: {
    borderRadius: radii.inset,
    padding: 14,
  },
  button: {
    height: 56,
    paddingHorizontal: 22,
    borderRadius: radii.pill,
  },
  stepperButton: {
    size: 36, // circular − / +
    borderRadius: radii.pill,
  },
  fab: {
    size: 64,
    borderRadius: radii.pill,
  },
  tabBar: {
    height: 64,
    iconSize: 26,
  },
  hitSlop: 10, // expand small targets toward the 44pt minimum
  minTouchTarget: 44,
} as const;

export type Spacing = typeof spacing;
export type Radii = typeof radii;
export type Sizes = typeof sizes;
