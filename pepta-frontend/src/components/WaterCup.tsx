// WaterCup — a glass that fills with the day's water (matches the lab Home water
// card). The fill height tracks current/target; the number sits in the glass.

import React from 'react';
import Svg, { ClipPath, Defs, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme';

const CUP = 'M26 8 H70 L64 112 a9 9 0 0 1 -9 8 H41 a9 9 0 0 1 -9 -8 Z';

export interface WaterCupProps {
  value: number;
  target: number | null;
  color: string;
  size?: number;
}

export function WaterCup({ value, target, color, size = 116 }: WaterCupProps) {
  const theme = useTheme();
  const pct = target && target > 0 ? Math.min(1, value / target) : 0;
  const fillY = 120 - pct * 112; // cup interior spans y 8..120

  return (
    <Svg width={(size * 96) / 128} height={size} viewBox="0 0 96 128">
      <Defs>
        <ClipPath id="waterCup">
          <Path d={CUP} />
        </ClipPath>
      </Defs>
      <G clipPath="url(#waterCup)">
        <Rect x={0} y={0} width={96} height={128} fill="#F4FAFF" />
        <Rect x={0} y={fillY} width={96} height={128 - fillY} fill={color} opacity={0.22} />
        <Rect x={0} y={fillY} width={96} height={4} fill={color} opacity={0.5} />
      </G>
      <Path d={CUP} fill="none" stroke="#D2D4DC" strokeWidth={3} />
      <SvgText x={48} y={52} textAnchor="middle" fontSize={22} fontWeight="800" fill={theme.colors.textPrimary}>
        {Math.round(value)}
      </SvgText>
      <SvgText x={48} y={68} textAnchor="middle" fontSize={11} fill={theme.colors.textSecondary}>
        oz
      </SvgText>
    </Svg>
  );
}
