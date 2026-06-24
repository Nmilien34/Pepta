// RulerPicker — a horizontal ruler/scale you drag to pick a whole number. Used
// for the aspirational "dream weight" moment. Center indicator marks the value;
// every 5th tick is taller + labeled. Same haptic + tick as WheelPicker.
//
// Geometry: each tick is TICK wide; padding both ends = halfWidth − TICK/2 so the
// first/last value can sit under the center. value index = round(scrollX / TICK).

import React, { useEffect, useRef, useState } from 'react';
import {
  Platform,
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useTheme } from '../theme';
import { AppText } from './AppText';
import tickSound from '../../assets/tick.wav';

const TICK = 12;
const MAJOR = 5;

export interface RulerPickerProps {
  value: number;
  onChange(value: number): void;
  min: number;
  max: number;
}

export function RulerPicker({ value, onChange, min, max }: RulerPickerProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const lastVal = useRef(value);
  const player = useAudioPlayer(tickSound);
  const count = max - min + 1;
  const sidePad = width > 0 ? width / 2 - TICK / 2 : 0;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }, []);

  // Keep the centered tick aligned with the controlled value. Scrolling drives
  // value during drag; parent-driven changes like unit conversion should move
  // the ruler too.
  useEffect(() => {
    if (width === 0) return;
    const x = (value - min) * TICK;
    const id = setTimeout(() => scrollRef.current?.scrollTo({ x, animated: false }), 0);
    return () => clearTimeout(id);
  }, [value, min, width]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const v = Math.min(max, Math.max(min, min + Math.round(x / TICK)));
    if (v === lastVal.current) return;
    lastVal.current = v;
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => undefined);
      try {
        player.seekTo(0);
        player.play();
      } catch {
        // audio not ready — ignore
      }
    }
    onChange(v);
  };

  return (
    <View style={{ height: 84 }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: width / 2 - 1.5,
            top: 8,
            width: 3,
            height: 40,
            borderRadius: 2,
            backgroundColor: theme.colors.primary,
            zIndex: 2,
          }}
        />
      ) : null}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={TICK}
        decelerationRate="fast"
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: sidePad }}
        onScroll={onScroll}
      >
        {Array.from({ length: count }, (_, i) => {
          const v = min + i;
          const major = v % MAJOR === 0;
          return (
            <View key={v} style={{ width: TICK, alignItems: 'center' }}>
              <View
                style={{
                  width: major ? 2 : 1,
                  height: major ? 32 : 18,
                  borderRadius: 1,
                  marginTop: 8,
                  backgroundColor: major ? theme.colors.textTertiary : theme.colors.border,
                }}
              />
              {major ? (
                <AppText variant="caption" color="textTertiary" style={{ fontSize: 10, marginTop: 4 }}>
                  {v}
                </AppText>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
