// Font loading for Pepta. Hanken Grotesk is the display + body face — a clean
// geometric grotesk that goes near-black at 800 for the big stats/titles the
// brand leans on. React Native picks weights by family NAME (not fontWeight),
// so each weight is a distinct family; typography.ts references these names.

import {
  useFonts,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
} from '@expo-google-fonts/hanken-grotesk';

// Family names, keyed by weight role. Kept in sync with FONT_FAMILIES in
// typography.ts (which only needs the strings, not the asset imports).
export const FONT_FAMILIES = {
  medium: 'HankenGrotesk_500Medium',
  semiBold: 'HankenGrotesk_600SemiBold',
  bold: 'HankenGrotesk_700Bold',
  heavy: 'HankenGrotesk_800ExtraBold',
} as const;

// Returns true once the Hanken faces are ready. App gates its first paint on
// this so text never flashes in the system fallback.
export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    HankenGrotesk_800ExtraBold,
  });
  return loaded;
}
