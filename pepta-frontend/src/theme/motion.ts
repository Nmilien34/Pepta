// Pepta motion tokens — gentle springs and restrained timings (Master Prompt
// §3E). Spring values are lifted from Foster so motion feels like a sibling:
// sheets present on a soft spring, taps give a subtle scale bounce, stats count
// up, rings/curves animate-fill on mount, tabs cross-fade.

export const durations = {
  fast: 200,
  base: 300,
  slow: 450,
  countUp: 700, // stat number count-ups
} as const;

// react-native Animated.spring configs.
export const springs = {
  // Bottom-sheet present (Foster: damping 28, stiffness 270, mass 0.8).
  sheet: { damping: 28, stiffness: 270, mass: 0.8 },
  // Press feedback — calmer than Foster's; settles fast without overshoot.
  press: { tension: 300, friction: 12 },
  // General gentle entrance for rings, badges.
  gentle: { damping: 18, stiffness: 180, mass: 1 },
} as const;

export const scale = {
  pressIn: 0.97, // subtle, calm app
  pressOut: 1,
} as const;

export type Springs = typeof springs;
export type Durations = typeof durations;
