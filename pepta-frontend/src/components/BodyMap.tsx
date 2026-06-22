// BodyMap — front/back body silhouettes with injection-site dots. Used sites are
// filled, the suggested next site is ringed, the rest are hollow. Mirrors the
// design lab's #body symbol.

import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme } from '../theme';
import { AppText } from './AppText';
import { BACK_SITES, FRONT_SITES, type InjectionSite } from '../screens/app/trackView';

const SITE_POS: Record<InjectionSite, { x: number; y: number }> = {
  arm_left: { x: 18, y: 44 },
  arm_right: { x: 62, y: 44 },
  abdomen_left: { x: 33, y: 58 },
  abdomen_right: { x: 47, y: 58 },
  thigh_left: { x: 34, y: 104 },
  thigh_right: { x: 46, y: 104 },
  buttock_left: { x: 33, y: 86 },
  buttock_right: { x: 47, y: 86 },
};

export interface BodyMapProps {
  used: Set<InjectionSite>;
  next: InjectionSite;
  size?: number;
  // When provided, site dots become tappable (used for picking a site).
  onSelect?: (site: InjectionSite) => void;
}

export function BodyMap({ used, next, size = 150, onSelect }: BodyMapProps) {
  const theme = useTheme();
  const width = (size * 80) / 150;

  const figure = (sites: InjectionSite[], label: string) => (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Svg width={width} height={size} viewBox="0 0 80 150">
        <Circle cx={40} cy={12} r={10} fill={theme.colors.bodyMapFill} />
        <Rect x={14} y={24} width={9} height={42} rx={4.5} fill={theme.colors.bodyMapFill} />
        <Rect x={57} y={24} width={9} height={42} rx={4.5} fill={theme.colors.bodyMapFill} />
        <Path d="M27 25 Q40 22 53 25 L50 70 Q40 74 30 70 Z" fill={theme.colors.bodyMapFill} />
        <Rect x={29} y={66} width={22} height={13} rx={6} fill={theme.colors.bodyMapFill} />
        <Rect x={29} y={78} width={10} height={62} rx={5} fill={theme.colors.bodyMapFill} />
        <Rect x={41} y={78} width={10} height={62} rx={5} fill={theme.colors.bodyMapFill} />
        {sites.map((site) => {
          const pos = SITE_POS[site];
          const isUsed = used.has(site);
          const isNext = site === next;
          return (
            <React.Fragment key={site}>
              <Circle
                cx={pos.x}
                cy={pos.y}
                r={5}
                fill={isUsed ? theme.colors.primary : '#FFFFFF'}
                stroke={isNext ? theme.colors.primary : isUsed ? 'none' : '#B7C0E6'}
                strokeWidth={isNext ? 2.5 : 2}
              />
              {onSelect ? (
                // Transparent larger hit target for comfortable tapping.
                <Circle cx={pos.x} cy={pos.y} r={11} fill="transparent" onPress={() => onSelect(site)} />
              ) : null}
            </React.Fragment>
          );
        })}
      </Svg>
      <AppText variant="caption" color="textTertiary" style={{ fontSize: 11 }}>
        {label}
      </AppText>
    </View>
  );

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
      {figure(FRONT_SITES, 'Front')}
      {figure(BACK_SITES, 'Back')}
    </View>
  );
}
