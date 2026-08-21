// WaterCup — the glass on the Home water card (design-lab "Home" frame).
//
// WHY THE DETAIL. The previous version drew the outline of a cup and filled a
// rectangle behind it: correct data, but it read as a bar chart shaped like a
// glass. What makes a glass look like a glass is the parts that are not the
// outline — the open elliptical rim, the wall highlight that is bright at the
// edges and clear through the middle, and above all the meniscus: the ellipse
// where the water surface meets the glass. A flat horizontal edge on the water
// is the single thing that gives away a fake.
//
// GEOMETRY. The glass tapers, so the water surface is narrower the lower it
// sits. `surfaceRadius` derives that from the fill height rather than a fixed
// radius — a constant one detaches from the wall as the glass empties.
//
// The water takes the caller's colour so it stays themed; the glass itself is
// neutral, because glass has no brand colour.

import React, { useEffect, useId, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import Svg, {
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { useTheme } from '../theme';
import { fillLine, INTERIOR, RIM_Y, surfaceRadius } from './waterCupGeometry';
import { levelOffset, wavePath, WAVE_PERIOD_MS, WAVE_PERIOD_SLOW_MS } from './waterWave';

const AnimatedG = Animated.createAnimatedComponent(G);

const CUP_WIDTH = 96;
// Two surfaces of different wavelength and amplitude. The shallower, slower one
// reads as the reflection of the first rather than a second wave, which is what
// stops the pair from looking mechanical.
const WAVE_FRONT = { amplitude: 2.6, wavelength: 44 };
const WAVE_BACK = { amplitude: 1.7, wavelength: 61 };

/** Rim at y=13, base at y=116. Tapered, with a rounded foot. */
const CUP = 'M24 13 L33 108 a8 8 0 0 0 8 8 h14 a8 8 0 0 0 8-8 L72 13 Z';

export interface WaterCupProps {
  value: number;
  target: number | null;
  color: string;
  size?: number;
}

export function WaterCup({ value, target, color, size = 116 }: WaterCupProps) {
  const theme = useTheme();
  // Unique per instance. react-native-svg resolves url(#id) references through
  // a name map that has collided across surfaces on Android, and the Water
  // screen puts a second cup in the tree — two glasses sharing a clip path is
  // the kind of bug that only shows up on one platform.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const clipId = `waterCupClip${uid}`;
  const wallId = `waterCupWall${uid}`;
  const fillId = `waterCupFill${uid}`;
  const pct = target && target > 0 ? Math.max(0, Math.min(1, value / target)) : 0;
  const fillY = fillLine(pct);
  const hasWater = pct > 0;

  // THE LEVEL IS TRANSLATED, NOT RESIZED. The water body is drawn once at full
  // height and slid down; animating a transform keeps the wave's own geometry
  // fixed, so the surface never stretches. Resizing a rect would squash the
  // meniscus flat at low levels — the exact artefact the wave replaces.
  const drop = useRef(new Animated.Value(levelOffset(pct, INTERIOR))).current;
  // Phase 0..1, mapped to a slide of one full glass width. The paths are drawn
  // 2× wide, so at the moment this snaps back the second copy sits exactly
  // where the first began and the loop has no seam.
  const frontPhase = useRef(new Animated.Value(0)).current;
  const backPhase = useRef(new Animated.Value(0)).current;
  const reduceMotion = useRef(false);

  useEffect(() => {
    // A glass filling itself has weight — it should settle, not snap. This also
    // carries the range change: switching Today → Month drains it rather than
    // cutting, which is what makes the range mean something.
    const animation = Animated.timing(drop, {
      toValue: levelOffset(pct, INTERIOR),
      duration: 900,
      easing: Easing.out(Easing.cubic),
      // SVG props do not cross the native-driver boundary.
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [pct, drop]);

  useEffect(() => {
    let cancelled = false;
    const loops: Animated.CompositeAnimation[] = [];

    const start = () => {
      if (cancelled || reduceMotion.current) return;
      for (const [phase, duration] of [
        [frontPhase, WAVE_PERIOD_MS],
        [backPhase, WAVE_PERIOD_SLOW_MS],
      ] as const) {
        phase.setValue(0);
        const loop = Animated.loop(
          Animated.timing(phase, {
            toValue: 1,
            duration,
            // Linear, always: any easing makes the water visibly hesitate at
            // the loop point, which is the one frame this design cannot afford.
            easing: Easing.linear,
            useNativeDriver: false,
          }),
        );
        loops.push(loop);
        loop.start();
      }
    };

    // Honour the system setting rather than animating over someone who asked
    // us not to. Still water is a perfectly good glass.
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        reduceMotion.current = enabled;
        start();
      })
      .catch(() => start());

    return () => {
      cancelled = true;
      for (const loop of loops) loop.stop();
    };
  }, [frontPhase, backPhase]);

  const frontD = useMemo(() => wavePath({ width: CUP_WIDTH, ...WAVE_FRONT, depth: INTERIOR + 24 }), []);
  const backD = useMemo(() => wavePath({ width: CUP_WIDTH, ...WAVE_BACK, depth: INTERIOR + 24 }), []);
  const slide = (phase: Animated.Value) =>
    phase.interpolate({ inputRange: [0, 1], outputRange: [0, -CUP_WIDTH] });

  return (
    <Svg width={(size * 96) / 132} height={size} viewBox="0 0 96 132">
      <Defs>
        <ClipPath id={clipId}>
          <Path d={CUP} />
        </ClipPath>
        {/* Bright at both edges, clear through the middle — the curve of the wall. */}
        <LinearGradient id={wallId} x1="0" x2="1" y1="0" y2="0">
          <Stop offset="0" stopColor="#B9C2CE" stopOpacity="0.85" />
          <Stop offset="0.18" stopColor="#DDE3EA" stopOpacity="0.5" />
          <Stop offset="0.5" stopColor="#C9D1DA" stopOpacity="0.35" />
          <Stop offset="0.84" stopColor="#DDE3EA" stopOpacity="0.5" />
          <Stop offset="1" stopColor="#B9C2CE" stopOpacity="0.85" />
        </LinearGradient>
        <LinearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.38" />
          <Stop offset="1" stopColor={color} stopOpacity="0.62" />
        </LinearGradient>
      </Defs>

      {/* Contact shadow — without it the glass floats. */}
      <Ellipse cx={48} cy={122} rx={19} ry={3.4} fill="#7C8595" opacity={0.13} />

      <Path d={CUP} fill="#F3F8FD" opacity={0.55} />

      <G clipPath={`url(#${clipId})`}>
        {hasWater ? (
          <>
            {/* The whole body rides one translateY. Drawn from the rim down, so
                a drop of `levelOffset` puts the surface exactly on the fill
                line — see waterWave.levelOffset. */}
            <AnimatedG transform={[{ translateY: drop }]}>
              {/* Back wave first: shallower and slower, it reads as the far
                  side of the surface seen through the water. */}
              <AnimatedG transform={[{ translateX: slide(backPhase) }]}>
                <Path
                  d={backD}
                  y={RIM_Y - WAVE_BACK.amplitude}
                  fill={color}
                  opacity={0.28}
                />
              </AnimatedG>
              <AnimatedG transform={[{ translateX: slide(frontPhase) }]}>
                <Path
                  d={frontD}
                  y={RIM_Y - WAVE_FRONT.amplitude}
                  fill={`url(#${fillId})`}
                />
              </AnimatedG>
            </AnimatedG>
            {/* The meniscus stays STATIC at the settled fill line. It is the
                contact between water and glass, so it belongs to the glass, not
                to the moving surface — riding the waves would peel it off the
                wall. Sized to the taper at this height so it meets both walls. */}
            <Ellipse
              cx={48}
              cy={fillY}
              rx={surfaceRadius(fillY)}
              ry={3}
              fill={color}
              opacity={0.4}
            />
            {/* Light pooling on the base. */}
            <Ellipse cx={48} cy={113} rx={17} ry={4} fill={color} opacity={0.18} />
          </>
        ) : null}

        {/* Specular streaks. Inside the clip so they read as ON the glass. */}
        <Rect x={30} y={22} width={4.5} height={84} rx={2.2} fill="#fff" opacity={0.62} />
        <Rect x={38} y={26} width={2} height={72} rx={1} fill="#fff" opacity={0.34} />
        <Rect x={60} y={32} width={3} height={64} rx={1.5} fill="#fff" opacity={0.28} />
      </G>

      <Path
        d={CUP}
        fill="none"
        stroke={`url(#${wallId})`}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />

      {/* The open top, drawn last so the wall runs into it. */}
      <Ellipse cx={48} cy={RIM_Y} rx={24} ry={5.2} fill="#EAF3FB" opacity={0.8} />
      <Ellipse cx={48} cy={RIM_Y} rx={24} ry={5.2} fill="none" stroke="#C3CCD6" strokeWidth={2.2} />
      <Ellipse cx={48} cy={RIM_Y} rx={20} ry={3.4} fill="none" stroke="#fff" strokeWidth={1.3} opacity={0.7} />

      <SvgText
        x={48}
        y={52}
        textAnchor="middle"
        fontSize={23}
        fontWeight="800"
        letterSpacing={-1}
        fill={theme.colors.textPrimary}
      >
        {Math.round(value)}
      </SvgText>
      <SvgText x={48} y={68} textAnchor="middle" fontSize={11} fontWeight="600" fill={theme.colors.textSecondary}>
        oz
      </SvgText>
    </Svg>
  );
}
