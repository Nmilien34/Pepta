// Slider — a draggable 0..1 control (PanResponder-based; RN core has no Slider).
// Gradient fill, a lifted thumb, and a light haptic each time the value crosses
// into a new third (the pace zones). Refs keep the gesture handler free of stale
// closures over width/onChange.

import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme';

const THUMB = 24;

export interface SliderProps {
  value: number;
  onChange(value: number): void;
}

export function Slider({ value, onChange }: SliderProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const zoneRef = useRef(-1);

  const update = (x: number) => {
    const w = widthRef.current;
    if (w <= 0) return;
    const v = Math.min(1, Math.max(0, x / w));
    const zone = Math.min(2, Math.floor(v * 3));
    if (zone !== zoneRef.current) {
      zoneRef.current = zone;
      Haptics.selectionAsync().catch(() => undefined);
    }
    onChangeRef.current(v);
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => update(e.nativeEvent.locationX),
        onPanResponderMove: (e) => update(e.nativeEvent.locationX),
      }),
    [],
  );

  const clamped = Math.min(1, Math.max(0, value));
  const fillW = width * clamped;

  return (
    <View
      style={{ height: THUMB, justifyContent: 'center' }}
      onLayout={(e: LayoutChangeEvent) => {
        const w = e.nativeEvent.layout.width;
        widthRef.current = w;
        setWidth(w);
      }}
      {...pan.panHandlers}
    >
      <View style={{ height: 8, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surfaceAlt }} />
      <View style={{ position: 'absolute', left: 0, height: 8, width: fillW, borderRadius: theme.radii.pill, overflow: 'hidden' }}>
        <LinearGradient
          colors={[theme.colors.primaryGradientStart, theme.colors.primaryGradientEnd] as const}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </View>
      <View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: Math.max(0, Math.min(width - THUMB, fillW - THUMB / 2)),
            width: THUMB,
            height: THUMB,
            borderRadius: theme.radii.pill,
            backgroundColor: theme.colors.surface,
            borderWidth: 2,
            borderColor: theme.colors.primary,
          },
          theme.shadows.soft,
        ]}
      />
    </View>
  );
}
