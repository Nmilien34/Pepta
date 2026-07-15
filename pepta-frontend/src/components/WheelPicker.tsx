// WheelPicker — a single chronometer-style wheel column (mirrors Leanient's
// Wheel): snaps to each item, the centered item scales up and neighbors fade by
// distance, and each change fires a haptic tick. Dropped Leanient's audio tick
// (avoids the expo-audio dep + asset) — haptics carry it.
//
// Re-center after the item set changes (e.g. month changes the day count) by
// giving the wheel a `key` that changes — it remounts and parks on the value.

import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Platform,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useTheme } from '../theme';
import tickSound from '../../assets/tick.wav';

const ITEM_H = 44;

// Exported so a parent that composes several columns (DateWheel) can draw ONE
// unified selection band across all of them instead of one band per column.
export const WHEEL_ITEM_HEIGHT = ITEM_H;
export const WHEEL_HEIGHT = 176;

export interface WheelItem {
  label: string;
  value: number;
}

export interface WheelPickerProps {
  items: WheelItem[];
  value: number;
  onChange(value: number): void;
  height?: number;
  fontSize?: number;
  centerScale?: number;
  // Draw the highlighted center band. Off when a parent draws one shared band
  // across several columns (so the columns read as one picker card).
  band?: boolean;
}

export function WheelPicker({
  items,
  value,
  onChange,
  height = WHEEL_HEIGHT,
  fontSize = 18,
  centerScale = 1.35,
  band = true,
}: WheelPickerProps) {
  const theme = useTheme();
  const pad = (height - ITEM_H) / 2;
  const startIndex = useMemo(() => {
    const i = items.findIndex((item) => item.value === value);
    return i < 0 ? 0 : i;
  }, [items, value]);

  const scrollY = useRef(new Animated.Value(startIndex * ITEM_H)).current;
  const lastIdx = useRef(startIndex);
  const scrollRef = useRef<ScrollView>(null);
  const player = useAudioPlayer(tickSound);

  // Let the tick play even with the ring/silent switch on — it's a deliberate
  // UI cue (haptics already ignore the switch).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }, []);

  // Park on the initial value imperatively (contentOffset prop is unreliable).
  useEffect(() => {
    const y = startIndex * ITEM_H;
    const id = setTimeout(() => scrollRef.current?.scrollTo({ y, animated: false }), 0);
    return () => clearTimeout(id);
    // mount only — re-scrolling mid-fling would fight the user
  }, []);

  const tick = (idx: number) => {
    if (idx === lastIdx.current || idx < 0 || idx >= items.length) return;
    lastIdx.current = idx;
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => undefined);
      try {
        player.seekTo(0);
        player.play();
      } catch {
        // audio not ready yet — ignore
      }
    }
    const item = items[idx];
    if (item) onChange(item.value);
  };

  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: true,
    listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      tick(Math.round(e.nativeEvent.contentOffset.y / ITEM_H));
    },
  });

  return (
    <View style={{ height }}>
      {band ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 4,
            right: 4,
            top: pad,
            height: ITEM_H,
            borderRadius: 13,
            backgroundColor: theme.colors.surfaceAlt,
          }}
        />
      ) : null}
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingVertical: pad }}
        onScroll={onScroll}
      >
        {items.map((item, i) => {
          const center = i * ITEM_H;
          const inputRange = [
            (i - 2) * ITEM_H,
            (i - 1) * ITEM_H,
            center,
            (i + 1) * ITEM_H,
            (i + 2) * ITEM_H,
          ];
          const scale = scrollY.interpolate({
            inputRange,
            outputRange: [0.8, 0.92, centerScale, 0.92, 0.8],
            extrapolate: 'clamp',
          });
          const opacity = scrollY.interpolate({
            inputRange,
            outputRange: [0.25, 0.5, 1, 0.5, 0.25],
            extrapolate: 'clamp',
          });
          return (
            <View key={`${item.value}-${item.label}`} style={{ height: ITEM_H, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.Text
                style={{
                  fontFamily: theme.typography.fonts.heavy,
                  fontWeight: '800',
                  fontSize,
                  letterSpacing: -0.3,
                  color: theme.colors.textPrimary,
                  opacity,
                  transform: [{ scale }],
                }}
              >
                {item.label}
              </Animated.Text>
            </View>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}
