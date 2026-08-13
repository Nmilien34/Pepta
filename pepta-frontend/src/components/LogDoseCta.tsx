// The "log it" action on Home's Medication Level card.
//
// WHY IT EXISTS: the level model computes nothing until a dose exists, and the
// card said exactly that ("Log your first shot to start tracking levels.")
// without offering any way to do it. A diagnosis with no treatment — the user
// had to go find the + tab themselves. This puts the action inside the card
// that makes the claim.
//
// PURPLE IS THE DATA, TINT IS THE ACTION. Deliberately NOT Button.tsx primary:
// that is the screen-level purchase CTA, and borrowing its gradient + glow put
// six purple elements in one small card and made a status card read like a
// landing page (design-lab/home-log-cta.html rev 1, rejected). This is the soft
// tint from rev 2/3 — #F1EDFF on #6751E8, 44px, pill.
//
// THE HEARTBEAT (design-lab/home-log-cta-v3.html, variant 2, signed off):
// lub · short gap · smaller dub · long rest, on a 2.2s cycle. A DOUBLE thump,
// not a single swell: one smooth pulse reads as a rendering artefact and the
// eye discards it, whereas a pair reads as deliberate — so it gets noticed at a
// far smaller amplitude. 66% of every cycle is motionless.
//
// The fill deepens on each thump as well as scaling, because peripheral vision
// detects LUMINANCE change much better than shape change: a 5% scale on a pale
// lavender pill is nearly invisible out of the corner of the eye, a step darker
// is not. Both stay inside the tint family so the card never recolours.
//
// Scale and backgroundColor ride ONE Animated.Value on the JS driver —
// backgroundColor cannot be driven natively, and splitting them across two
// drivers risks the colour and the shape drifting out of sync. The cost is
// bounded: the animation is idle for 1.45s of every 2.2s.
//
// It stops for good once a dose exists (`pulse={false}`) and honours
// Reduce Motion, in which case the button renders static — never mid-beat.

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { useTheme } from '../theme';

/** Rev 3's signed-off rhythm, in ms. Sums to the 2.2s cycle. */
const LUB_MS = 176;
const VALLEY_MS = 176;
const DUB_MS = 176;
const SETTLE_MS = 220;
const REST_MS = 1452;

/** Beat value 0→1 maps onto these. Peak scale is the lub; the dub is smaller. */
const SCALE_AT_PEAK = 1.055;
const VALLEY = 0.07;
const DUB = 0.64;

const TINT = '#F1EDFF';
const TINT_DEEP = '#E4DCFF';
const TINT_INK = '#6751E8';

export interface LogDoseCtaProps {
  /** Route-aware: "Log a shot" / "Log a dose" — never hardcoded here. */
  label: string;
  /** True only while the user has no dose logged. */
  pulse: boolean;
  onPress(): void;
}

export function LogDoseCta({ label, pulse, onPress }: LogDoseCtaProps) {
  const theme = useTheme();
  const beat = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!pulse || reduceMotion) {
      // Reset rather than freeze: a stopped loop would leave the button
      // parked mid-thump, slightly enlarged and slightly darker, forever.
      beat.stopAnimation(() => beat.setValue(0));
      return;
    }
    // Fast attack, slow return. Equal easing both ways reads as a wobble.
    const attack = Easing.bezier(0.2, 0.6, 0.3, 1);
    const release = Easing.bezier(0.4, 0, 0.6, 1);
    const step = (toValue: number, duration: number, easing: typeof attack) =>
      Animated.timing(beat, { toValue, duration, easing, useNativeDriver: false });

    const loop = Animated.loop(
      Animated.sequence([
        step(1, LUB_MS, attack),
        step(VALLEY, VALLEY_MS, release),
        step(DUB, DUB_MS, attack),
        step(0, SETTLE_MS, release),
        Animated.delay(REST_MS),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [beat, pulse, reduceMotion]);

  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ marginTop: theme.spacing.md }}
    >
      {({ pressed }) => (
        <Animated.View
          style={{
            height: 44,
            borderRadius: theme.radii.pill,
            backgroundColor: beat.interpolate({
              inputRange: [0, 1],
              outputRange: [TINT, TINT_DEEP],
            }),
            transform: [
              {
                scale: beat.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, SCALE_AT_PEAK],
                }),
              },
            ],
            opacity: pressed ? 0.7 : 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Icon name="add" size={15} color={TINT_INK} stroke={2.6} />
            <AppText variant="caption" style={{ fontSize: 14, fontWeight: '800', color: TINT_INK }}>
              {label}
            </AppText>
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
}
