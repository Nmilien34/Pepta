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

import React, { useId } from 'react';
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
import { fillLine, RIM_Y, surfaceRadius } from './waterCupGeometry';

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
            <Rect x={0} y={fillY} width={96} height={132 - fillY} fill={`url(#${fillId})`} />
            {/* The meniscus. Sized to the glass at THIS height, so it stays
                pinned to both walls as the level moves. */}
            <Ellipse
              cx={48}
              cy={fillY}
              rx={surfaceRadius(fillY)}
              ry={3}
              fill={color}
              opacity={0.55}
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
