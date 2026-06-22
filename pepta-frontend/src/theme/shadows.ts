// Pepta elevation tokens. One soft shadow language — large blur, low opacity,
// no harsh borders on cards (Master Prompt §3C). Shadow color comes from the
// theme (`colors.shadow`) so dark mode reads correctly.

import type { ViewStyle } from 'react-native';

export function getShadows(shadowColor: string) {
  const card: ViewStyle = {
    shadowColor,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1, // opacity is baked into the rgba shadowColor token
    shadowRadius: 24,
    elevation: 3,
  };

  const soft: ViewStyle = {
    shadowColor,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 2,
  };

  // Lifted FAB / floating tab bar.
  const floating: ViewStyle = {
    shadowColor,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 28,
    elevation: 8,
  };

  return { card, soft, floating, none: {} as ViewStyle };
}

export type Shadows = ReturnType<typeof getShadows>;
