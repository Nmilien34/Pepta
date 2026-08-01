// Pep — the Pepta mascot, a friendly syringe (dosage stripes + plunger top).
// Rendered as vector (react-native-svg) so it scales crisply at any size; this
// is the placeholder until final 3D renders are commissioned (see the design
// lab `#pep` / `#pepwave` symbols, which this mirrors 1:1).
//
// Poses:
//   - 'idle'   — neutral, used in-app and on most onboarding steps
//   - 'wave'   — one arm raised, for Welcome / celebratory moments
//   - 'drowsy' — half-lidded, for the trough of the medication curve
//   - 'asleep' — eyes closed + zzz, for an off-cycle rest week
//   - 'cheer'  — sparkles, for a milestone
//   - 'gift'   — arms cradling a heart at the chest, for the trial offer beat
//   - 'peek'   — top-of-barrel crop (eyes over an edge), for the value carousel
//
// The added poses are OVERLAYS on the same body, not new artwork: they
// swap the eyes and add a small decoration ('peek' is a crop of the same
// geometry). Anything more would need real character art. There is
// deliberately NO sad or disappointed pose — see screens/app/pepMood.ts for
// why that matters on a medication tracker.

import React, { useId } from 'react';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

export type MascotPose = 'idle' | 'wave' | 'drowsy' | 'asleep' | 'cheer' | 'gift' | 'peek';

export interface MascotProps {
  pose?: MascotPose;
  // Rendered height in px; width is derived from the pose's aspect ratio.
  size?: number;
}

const VIEWBOX: Record<MascotPose, { w: number; h: number }> = {
  idle: { w: 120, h: 142 },
  wave: { w: 120, h: 150 },
  drowsy: { w: 120, h: 142 },
  asleep: { w: 120, h: 142 },
  cheer: { w: 120, h: 142 },
  gift: { w: 120, h: 142 },
  peek: { w: 120, h: 70 },
};

// Poses that close the eyes — they replace the open-eye group rather than
// drawing over it, so no white shows through the lids.
const LIDDED: ReadonlySet<MascotPose> = new Set<MascotPose>(['drowsy', 'asleep']);

export function Mascot({ pose = 'idle', size = 140 }: MascotProps) {
  const gradientId = useId();
  const vb = VIEWBOX[pose];
  const width = (size * vb.w) / vb.h;

  // 'peek' is a crop, not an overlay: just the plunger, the top arc of the
  // barrel, and the eyes rising over an edge (the carousel card's top rim).
  if (pose === 'peek') {
    return (
      <Svg width={width} height={size} viewBox="0 0 120 70">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#9C82FF" />
            <Stop offset="1" stopColor="#6E4EF0" />
          </LinearGradient>
        </Defs>
        <Rect x={34} y={4} width={52} height={7} rx={3.5} fill="#6E4EF0" />
        <Rect x={55} y={9} width={10} height={10} rx={3} fill="#7C5CFC" />
        <Path d="M27 70 v-13 a33 33 0 0 1 66 0 v13 Z" fill={`url(#${gradientId})`} />
        <G>
          <Ellipse cx={50} cy={44} rx={7} ry={8} fill="#fff" />
          <Ellipse cx={74} cy={44} rx={7} ry={8} fill="#fff" />
          <Circle cx={52.5} cy={46} r={3.4} fill="#1A1430" />
          <Circle cx={76.5} cy={46} r={3.4} fill="#1A1430" />
          <Circle cx={54} cy={44.5} r={1.2} fill="#fff" />
          <Circle cx={78} cy={44.5} r={1.2} fill="#fff" />
        </G>
      </Svg>
    );
  }

  // The wave pose shifts the body +10 on the y axis to make room for the plunger.
  const dy = pose === 'wave' ? 10 : 0;
  const stripeTop = 94 + dy;

  return (
    <Svg width={width} height={size} viewBox={`0 0 ${vb.w} ${vb.h}`}>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#9C82FF" />
          <Stop offset="1" stopColor="#6E4EF0" />
        </LinearGradient>
      </Defs>

      {/* plunger thumb-rest + rod */}
      <Rect x={34} y={1 + dy} width={52} height={7} rx={3.5} fill="#6E4EF0" />
      <Rect x={55} y={6 + dy} width={10} height={10} rx={3} fill="#7C5CFC" />

      {/* barrel body */}
      <Rect x={27} y={14 + dy} width={66} height={112} rx={33} fill={`url(#${gradientId})`} />
      <Path
        d={`M27 ${70 + dy} a33 33 0 0 0 66 0 v23 a33 33 0 0 1 -66 0 Z`}
        fill="#0E0E12"
        opacity={0.07}
      />
      <Ellipse cx={48} cy={38 + dy} rx={15} ry={11} fill="#fff" opacity={0.28} />

      {/* eyes — open, or closed lids for the low-energy poses */}
      {LIDDED.has(pose) ? (
        <G stroke="#1A1430" strokeWidth={3} fill="none" strokeLinecap="round">
          <Path d={`M43 ${64 + dy} q7 ${pose === 'asleep' ? 5 : 4} 14 0`} />
          <Path d={`M67 ${64 + dy} q7 ${pose === 'asleep' ? 5 : 4} 14 0`} />
        </G>
      ) : (
        // <G>, never a Fragment: react-native-svg walks its children looking
        // for SVG element types and a Fragment is not one — it breaks the
        // render rather than being transparent the way it is in normal JSX.
        <G>
          <Ellipse cx={50} cy={64 + dy} rx={8} ry={9} fill="#fff" />
          <Ellipse cx={74} cy={64 + dy} rx={8} ry={9} fill="#fff" />
          <Circle cx={51.5} cy={66 + dy} r={3.7} fill="#1A1430" />
          <Circle cx={75.5} cy={66 + dy} r={3.7} fill="#1A1430" />
          <Circle cx={53} cy={64.5 + dy} r={1.3} fill="#fff" />
          <Circle cx={77} cy={64.5 + dy} r={1.3} fill="#fff" />
        </G>
      )}

      {/* cheeks + smile */}
      <Ellipse cx={39} cy={80 + dy} rx={6} ry={3.8} fill="#FF9CB6" opacity={0.6} />
      <Ellipse cx={85} cy={80 + dy} rx={6} ry={3.8} fill="#FF9CB6" opacity={0.6} />
      <Path
        d={`M53 ${81 + dy} q7 6.5 14 0`}
        stroke="#1A1430"
        strokeWidth={3.2}
        fill="none"
        strokeLinecap="round"
      />

      {/* dosage graduation stripes */}
      <G stroke="#fff" strokeWidth={2} strokeLinecap="round" opacity={0.6}>
        <Line x1={33} y1={stripeTop} x2={47} y2={stripeTop} />
        <Line x1={33} y1={stripeTop + 7} x2={42} y2={stripeTop + 7} />
        <Line x1={33} y1={stripeTop + 14} x2={47} y2={stripeTop + 14} />
        <Line x1={33} y1={stripeTop + 21} x2={42} y2={stripeTop + 21} />
        <Line x1={33} y1={stripeTop + 28} x2={47} y2={stripeTop + 28} />
      </G>

      {/* raised waving arm */}
      {pose === 'wave' ? (
        <G transform="rotate(22 98 64)">
          <Ellipse cx={98} cy={48} rx={8} ry={12} fill="#7C5CFC" />
        </G>
      ) : null}

      {/* asleep — drifting z's */}
      {pose === 'asleep' ? (
        <G fill="#7C5CFC">
          <SvgText x={95} y={38} fontSize={16} fontWeight="bold">z</SvgText>
          <SvgText x={106} y={24} fontSize={11} fontWeight="bold" opacity={0.7}>z</SvgText>
        </G>
      ) : null}

      {/* the trial-offer beat — arms cradling a heart at the chest */}
      {pose === 'gift' ? (
        <G>
          <G transform="rotate(-34 24 100)">
            <Ellipse cx={24} cy={100} rx={7.5} ry={11.5} fill="#7C5CFC" />
          </G>
          <G transform="rotate(34 96 100)">
            <Ellipse cx={96} cy={100} rx={7.5} ry={11.5} fill="#7C5CFC" />
          </G>
          <Path
            d="M60 95 c-5 -9 -18 -8 -18 3 c0 8 11 13 18 18 c7 -5 18 -10 18 -18 c0 -11 -13 -12 -18 -3 Z"
            fill="#E25CC4"
          />
          <Path
            d="M50 94.5 a5 5 0 0 1 5.5 -2"
            stroke="#fff"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            opacity={0.7}
          />
        </G>
      ) : null}

      {/* milestone — a small burst, no confetti and no numbers */}
      {pose === 'cheer' ? (
        <G stroke="#F5B301" strokeWidth={3} strokeLinecap="round">
          <Line x1={16} y1={32} x2={7} y2={25} />
          <Line x1={20} y1={19} x2={16} y2={8} />
          <Line x1={33} y1={12} x2={31} y2={2} />
          <Line x1={104} y1={32} x2={113} y2={25} />
          <Line x1={100} y1={19} x2={104} y2={8} />
        </G>
      ) : null}
    </Svg>
  );
}
