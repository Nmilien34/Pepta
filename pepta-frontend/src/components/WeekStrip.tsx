// Week strip inside the Track Next-dose card — the design hub's `.wks` idiom:
// seven equal cells (day letter, day number, 4.5px dot), today's number on a
// primary 28px rounded square. Purple dot = due, green = logged, none = rest
// or nothing planned. Pure presentation; days come from scheduleView.weekStrip.

import React from 'react';
import { View } from 'react-native';
import { AppText } from './AppText';
import { useTheme } from '../theme';
import type { StripDay } from '../screens/app/scheduleView';

export function WeekStrip({ days }: { days: StripDay[] }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 0.5,
        borderTopColor: theme.colors.border,
      }}
    >
      {days.map((day) => (
        <View key={day.date} style={{ flex: 1, alignItems: 'center' }}>
          <AppText
            variant="caption"
            color="textTertiary"
            style={{ fontSize: 10, fontWeight: '700', marginBottom: 6 }}
          >
            {day.letter}
          </AppText>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: day.isToday ? theme.colors.primary : 'transparent',
            }}
          >
            <AppText
              variant="caption"
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: day.isToday ? theme.colors.onPrimary : theme.colors.textPrimary,
              }}
            >
              {day.dayOfMonth}
            </AppText>
          </View>
          <View
            style={{
              width: 4.5,
              height: 4.5,
              borderRadius: 99,
              marginTop: 4,
              backgroundColor:
                day.mark === 'due'
                  ? theme.colors.primary
                  : day.mark === 'logged'
                    ? theme.colors.fiber
                    : 'transparent',
            }}
          />
        </View>
      ))}
    </View>
  );
}
