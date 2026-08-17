// Font loading for Pepta. Hanken Grotesk is the display + body face — a clean
// geometric grotesk that goes near-black at 800 for the big stats/titles the
// brand leans on. React Native picks weights by family NAME (not fontWeight),
// so each weight is a distinct family; typography.ts references these names.
//
// Bodoni Moda 600 is the ONE serif, used only for the welcome screen's
// promise line. It buys contrast against the wordmark sitting directly above
// it — the two read as one heavy block when both are Hanken. Loading it here
// (rather than lazily on that screen) keeps the first-paint gate honest: the
// welcome screen IS the first paint.

import {
  useFonts,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
} from '@expo-google-fonts/hanken-grotesk';
import { BodoniModa_600SemiBold } from '@expo-google-fonts/bodoni-moda';

// Family names, keyed by weight role. Kept in sync with FONT_FAMILIES in
// typography.ts (which only needs the strings, not the asset imports).
export const FONT_FAMILIES = {
  medium: 'HankenGrotesk_500Medium',
  semiBold: 'HankenGrotesk_600SemiBold',
  bold: 'HankenGrotesk_700Bold',
  heavy: 'HankenGrotesk_800ExtraBold',
  /** Serif display — welcome promise only. */
  serif: 'BodoniModa_600SemiBold',
} as const;

// Returns true once the Hanken faces are ready. App gates its first paint on
// this so text never flashes in the system fallback. If loading FAILS we also
// return true — rendering with the system fallback beats gating forever on a
// blank screen (App Review rejects a blank launch as a 2.1(a) bug).
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    HankenGrotesk_800ExtraBold,
    BodoniModa_600SemiBold,
  });
  return loaded || error != null;
}
