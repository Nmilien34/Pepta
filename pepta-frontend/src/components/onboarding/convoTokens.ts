// The conversational-onboarding palette (design-lab onboarding-v2.html, v2.2).
// A near-white ground with faint purple orbs; ink text; purple reserved for the
// caret, the progress fill, the sent bubble, and one accent square per screen.
// Kept separate from theme colors because these are the conversation's own
// values (dim = 50% ink echo, hairlines) that nothing else in the app uses.

export const convo = {
  ground: "#FCFBFE",
  ink: "#17141F",
  // The previous answer echoes at full type scale, dimmed to 50% — clearly a
  // "recall" under the full-ink live question, but still legible over the ground
  // orbs (34% washed out to near-invisible where it crossed an orb).
  dim: "rgba(23,20,31,0.5)",
  soft: "rgba(23,20,31,0.55)",
  faint: "rgba(23,20,31,0.4)",
  hairline: "rgba(23,20,31,0.12)",
  chipBorder: "rgba(23,20,31,0.14)",
  ctaBorder: "rgba(23,20,31,0.18)",
  pressFill: "rgba(23,20,31,0.04)",
  surface: "#FFFFFF",
  primary: "#7C5CFC",
  onPrimary: "#FFFFFF",
  // Soft purple washes for the ground orbs.
  orb: "rgba(124,92,252,0.05)",
  orbHi: "rgba(124,92,252,0.075)",
  // The single dark screen (paywall wall).
  wall: "#171128",
} as const;
