// DateWheel — month / day / year via three WheelPickers. Keeps the day valid
// when the month or year changes (clamps Feb 31 → Feb 28), and optionally pins
// the max to "today" for past-only dates (last shot, start date). The day wheel
// remounts (keyed on month+year) so it re-centers after its item count changes.

import React from 'react';
import { View } from 'react-native';
import { WheelPicker, WHEEL_HEIGHT, WHEEL_ITEM_HEIGHT, type WheelItem } from './WheelPicker';
import { useTheme } from '../theme';
import {
  MONTHS_SHORT,
  clampDay,
  clampToToday,
  daysInMonth,
  numberRange,
  type DateParts,
} from '../utils/dateParts';

export interface DateWheelProps {
  value: DateParts;
  onChange(parts: DateParts): void;
  minYear: number;
  maxYear: number;
  // Disallow future dates (clamps the result back to `now`).
  maxToday?: boolean;
  now?: Date;
}

const MONTH_ITEMS: WheelItem[] = MONTHS_SHORT.map((label, value) => ({ label, value }));

export function DateWheel({ value, onChange, minYear, maxYear, maxToday, now }: DateWheelProps) {
  const theme = useTheme();
  const reference = now ?? new Date();
  const bandTop = (WHEEL_HEIGHT - WHEEL_ITEM_HEIGHT) / 2;
  const dayItems: WheelItem[] = numberRange(1, daysInMonth(value.year, value.month)).map((d) => ({
    label: String(d),
    value: d,
  }));
  const yearItems: WheelItem[] = numberRange(minYear, maxYear).map((y) => ({
    label: String(y),
    value: y,
  }));

  const commit = (parts: DateParts) => {
    const clamped = clampDay(parts);
    onChange(maxToday ? clampToToday(clamped, reference) : clamped);
  };

  return (
    <View style={{ position: 'relative' }}>
      {/* One shared selection band behind all three columns — the picker reads
          as a single card, not three separate bands. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 4,
          right: 4,
          top: bandTop,
          height: WHEEL_ITEM_HEIGHT,
          borderRadius: 13,
          backgroundColor: theme.colors.surfaceAlt,
        }}
      />
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <View style={{ flex: 1.4 }}>
          <WheelPicker
            band={false}
            items={MONTH_ITEMS}
            value={value.month}
            onChange={(month) => commit({ ...value, month })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <WheelPicker
            band={false}
            key={`${value.year}-${value.month}`}
            items={dayItems}
            value={value.day}
            onChange={(day) => commit({ ...value, day })}
          />
        </View>
        <View style={{ flex: 1.2 }}>
          <WheelPicker
            band={false}
            items={yearItems}
            value={value.year}
            onChange={(year) => commit({ ...value, year })}
          />
        </View>
      </View>
    </View>
  );
}
