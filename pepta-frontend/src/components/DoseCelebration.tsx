// The moment after a dose is logged: confetti and a word from Pep.
//
// Mounted by LogSheetsProvider, ABOVE the sheets, so it survives the quick-log
// sheet closing — the sheet dismisses itself on commit, so anything rendered
// inside it would unmount before it could be seen.
//
// Auto-dismisses. There is no button: a celebration that has to be acknowledged
// is a chore, and the user's next tap should never be spent on our applause.
// pointerEvents="none" throughout so it cannot swallow that tap either.
//
// Reduce Motion drops the confetti and the spring, keeping the card and the
// words — the information survives, the spectacle does not.

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Confetti } from './Confetti';
import { useTheme } from '../theme';
import type { DoseCelebration as Celebration } from '../screens/app/doseCelebration';

/** Long enough to read two short lines, short enough to not be in the way. */
export const CELEBRATION_MS = 2600;

export interface DoseCelebrationOverlayProps {
  celebration: Celebration | null;
  onDone(): void;
}

export function DoseCelebrationOverlay({ celebration, onDone }: DoseCelebrationOverlayProps) {
  const theme = useTheme();
  const enter = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!celebration) return;
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: reduceMotion ? 0 : 260,
      easing: Easing.bezier(0.2, 0.7, 0.2, 1),
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(() => {
      Animated.timing(enter, {
        toValue: 0,
        duration: reduceMotion ? 0 : 200,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(() => onDone());
    }, CELEBRATION_MS);
    return () => clearTimeout(timer);
  }, [celebration, enter, onDone, reduceMotion]);

  if (!celebration) return null;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      {celebration.burst && !reduceMotion ? <Confetti /> : null}
      <Animated.View
        style={{
          opacity: enter,
          transform: [
            { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
          ],
          backgroundColor: theme.colors.surface,
          borderRadius: theme.sizes.card.borderRadius,
          paddingVertical: 22,
          paddingHorizontal: 24,
          marginHorizontal: 34,
          alignItems: 'center',
          shadowColor: theme.colors.shadow,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 1,
          shadowRadius: 30,
          elevation: 6,
        }}
      >
        <AppText variant="statMedium" align="center">
          {celebration.title}
        </AppText>
        <AppText
          variant="caption"
          color="textSecondary"
          align="center"
          style={{ marginTop: 7, lineHeight: 19 }}
        >
          {celebration.line}
        </AppText>
      </Animated.View>
    </View>
  );
}
