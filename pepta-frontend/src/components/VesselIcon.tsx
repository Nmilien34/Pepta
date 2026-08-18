// The Quick add vessels on the Water screen — a glass, a mug, a bottle, a
// shaker, a sports bottle, a tumbler, and the keyboard for a typed amount.
//
// EACH ONE IS A DISTINCT SILHOUETTE, and each is drawn part-full. That is the
// point of the row: the user picks the thing in their hand rather than
// estimating ounces, so the tiles have to be told apart at 34pt in peripheral
// vision. Seven identical droplet glyphs with different numbers under them
// would be a list of numbers wearing pictures.
//
// The fill line differs per vessel because a tall bottle and a short glass do
// not look part-full at the same height. These are the design's own values.
//
// Ported from the design-lab Water frame, path for path.

import React, { useId } from 'react';
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';

/** Outline, and the y the water starts at, in the 24x34 viewBox. */
const VESSELS: Record<string, { d: string; fillY: number }> = {
  // Tapered glass.
  glass: { d: 'M6 12 L7.6 27 a2.2 2.2 0 0 0 2.2 2h4.4a2.2 2.2 0 0 0 2.2-2L18 12Z', fillY: 17.5 },
  // Mug — the second subpath is the handle, outside the fill clip.
  mug: { d: 'M5.5 8h10.5v18a3 3 0 0 1-3 3H8.5a3 3 0 0 1-3-3Z M16 12.5a4.2 4.2 0 0 1 0 9', fillY: 13.5 },
  // Water bottle with a neck and cap.
  bottle: { d: 'M10 2.5h4v3.5l2 3v18a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3V9l2-3Z', fillY: 12 },
  // Shaker — flat lid.
  shaker: { d: 'M6 8h12v18a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3Z M5.4 4.6h13.2v3.4H5.4Z', fillY: 13 },
  sports: { d: 'M9.6 2h4.8v3.6l1.6 2.4v19a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3V8l1.6-2.4Z', fillY: 11 },
  // Tumbler — straw and handle.
  tumbler: { d: 'M7 7 L8.6 27.5a2.6 2.6 0 0 0 2.6 2.5h1.6a2.6 2.6 0 0 0 2.6-2.5L17 7Z M13.6 1.4v5 M17 11a4.4 4.4 0 0 1 0 8', fillY: 10.5 },
};

/** Only the closed body takes the water — handles and straws must not fill. */
const BODY_ONLY: Record<string, string> = {
  mug: 'M5.5 8h10.5v18a3 3 0 0 1-3 3H8.5a3 3 0 0 1-3-3Z',
  shaker: 'M6 8h12v18a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3Z',
  tumbler: 'M7 7 L8.6 27.5a2.6 2.6 0 0 0 2.6 2.5h1.6a2.6 2.6 0 0 0 2.6-2.5L17 7Z',
};

const STROKE = '#B9C2CE';

export interface VesselIconProps {
  /** A key from VESSELS, or 'custom' for the keyboard. */
  vessel: string;
  water: string;
  width?: number;
  height?: number;
}

export function VesselIcon({ vessel, water, width = 34, height = 40 }: VesselIconProps) {
  // Per instance: react-native-svg has collided on duplicate ids across
  // surfaces, and this row renders seven of these side by side.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const clipId = `vessel${uid}`;

  if (vessel === 'custom') {
    return (
      <Svg width={width} height={height} viewBox="0 0 24 34">
        <Rect x={2} y={10} width={20} height={14} rx={3} fill="none" stroke={STROKE} strokeWidth={1.7} />
        <Path
          d="M6 14h.01M10 14h.01M14 14h.01M18 14h.01M6 18h.01M18 18h.01M9.5 18h5"
          fill="none"
          stroke={STROKE}
          strokeWidth={1.7}
          strokeLinecap="round"
        />
      </Svg>
    );
  }

  const shape = VESSELS[vessel] ?? VESSELS.glass!;
  const fillPath = BODY_ONLY[vessel] ?? shape.d;

  return (
    <Svg width={width} height={height} viewBox="0 0 24 34">
      <Defs>
        <ClipPath id={clipId}>
          <Path d={fillPath} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipId})`}>
        <Rect x={0} y={shape.fillY} width={24} height={34} fill={water} opacity={0.55} />
      </G>
      <Path
        d={shape.d}
        fill="none"
        stroke={STROKE}
        strokeWidth={1.7}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}
