// Pepta color tokens.
// Structure mirrors Foster's getColors(isDark) pattern, but the palette is
// Pepta's own: white base, gray components, purple/orange/green/blue/magenta
// accents (see Design & Frontend Master Prompt §3A). Light mode is primary and
// perfected first; dark tokens ship alongside it.

// Accent + data-type colors are shared across themes. Each data type owns a
// color so the eye learns the app ("color-coded cognition").
const accents = {
  // Brand / medication / level
  primary: "#7C5CFC",
  primaryGradientStart: "#6751E8",
  primaryGradientEnd: "#8C63F4",
  // The hub's --g1/--g2. NOT the same ramp as primaryGradient above: that one
  // is the darker button fill, this one is lighter and runs toward violet.
  // The hub uses it for meters and progress fills (at 90deg, and 135deg on
  // tiles), which is why a flat primary in its place reads as a disabled
  // control rather than a filled one.
  /**
   * PRIMARY BUTTON FILL, and its own edge.
   *
   * The button was a gradient (#6751E8→#8C63F4) in a full pill under a
   * coloured glow — three softening effects at once and no defined boundary,
   * so it read as a lozenge painted on the surface rather than an object cut
   * into it. Flat fill + a one-step-darker edge is what gives a button its
   * shape: the stroke reads as the object's own edge catching less light.
   *
   * The fill is `primaryGradientStart`, already in the palette — the gradient
   * collapsed to its deeper end, not a new colour. It is also the accessible
   * one: white on #6751E8 is 5.2:1 (passes AA), where white on the lighter
   * #7C5CFC is 4.3:1 and fails for anything but large text.
   */
  buttonFill: "#6751E8",
  buttonEdge: "#5642C4",
  /** Pressed: the fill darkens. A flat button has an edge worth holding still. */
  buttonFillPressed: "#5642C4",
  buttonEdgePressed: "#4736A8",
  fillGradientStart: "#8B6CFF",
  fillGradientEnd: "#C77DFF",
  // Data-type colors
  protein: "#FF8A3D", // orange — also streak
  streak: "#FF8A3D",
  fiber: "#34C759", // green — also success
  success: "#34C759",
  water: "#2FA8FF", // blue
  // Purple carries medication level AND weight. Level used to share water's
  // blue, which is the exact collision the colour pass was for: two unrelated
  // metrics reading as the same thing on one screen.
  level: "#7C5CFC",
  weight: "#7C5CFC",
  goal: "#7C5CFC",
  // Coral — activity is the one metric that is neither medication nor food,
  // and it was borrowing fiber's green, which made steps read as a nutrient.
  activity: "#FF6B5A",
  // Status
  warning: "#FFB020", // amber
  danger: "#FF4D4F", // red
  // Body map
  bodyMapFill: "#C9D2F2",
  bodyMapOutline: "#0E0E12",
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
  // The frame's food tint — the warm peach behind every "log a meal" action
  // (Home's meal CTA, Recipes' and Favourites' Log pills, New recipe's route
  // tiles). It is its own value, NOT protein at 13%: the frame warms it toward
  // cream so the food side of the app reads distinct from a tinted chip.
  // Semantic rather than an accent because a literal #FFF1E6 block glares on
  // the dark ground — it shipped hardcoded in three screens and was about to
  // become a fourth.
  foodTint: string;
  shadow: string;
  onPrimary: string;
}

const lightColors: SemanticColors = {
  // The warm ground from the redesign. Shared with convo.ground so the
  // handoff out of onboarding carries no temperature shift.
  bg: "#F7F5F2",
  surface: "#FFFFFF",
  // Warm siblings of bg, from the redesign. These were cool greys (#F2F3F5 /
  // #ECECEF) chosen against the old near-white ground; on #F7F5F2 they read
  // blue. Every pill, chip, inset row and hairline in the app keys off these,
  // which is why the ground change is not finished until they move too.
  surfaceAlt: "#F4F1EC",
  border: "#E9E4DB",
  textPrimary: "#0E0E12",
  textSecondary: "#6B6B76",
  textTertiary: "#A1A1AC",
  // Subtle tinted fills for inset rows / steppers, keyed off the gray scale.
  fillPrimary: "rgba(14,14,18,0.06)",
  fillSecondary: "rgba(14,14,18,0.04)",
  foodTint: "#FFF1E6",
  // Soft shadow color (large blur, low opacity).
  shadow: "rgba(40,32,24,0.10)",
  // Color on top of the primary gradient / colored buttons.
  onPrimary: "#FFFFFF",
} as const;

const darkColors: SemanticColors = {
  bg: "#0E0E12",
  surface: "#17171C",
  surfaceAlt: "#1F1F26",
  border: "rgba(255,255,255,0.08)",
  textPrimary: "#F5F5F7",
  textSecondary: "#A1A1AC",
  textTertiary: "#6B6B76",
  fillPrimary: "rgba(255,255,255,0.08)",
  fillSecondary: "rgba(255,255,255,0.04)",
  // Protein's own hue at low alpha: the same warm signal, carried by the
  // accent instead of a cream fill that would burn a hole in the dark screen.
  foodTint: "rgba(255,138,61,0.16)",
  shadow: "rgba(0,0,0,0.4)",
  onPrimary: "#FFFFFF",
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
  activity: accents.activity,
} as const;

export type ThemeColors = ReturnType<typeof getColors>;
export type DataColorKey = keyof typeof dataColors;
