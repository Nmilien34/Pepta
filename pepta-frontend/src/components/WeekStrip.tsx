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
              // A day you took your medication gets a light purple fill; TODAY
              // still wins with the solid one, so a day that is both reads as
              // today — the strip must never show two selected-looking squares.
              backgroundColor: day.isToday
                ? theme.colors.primary
                : day.mark === 'logged'
                  ? '#EFEBFF'
                  : 'transparent',
            }}
          >
            <AppText
              variant="caption"
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: day.isToday
                  ? theme.colors.onPrimary
                  : day.mark === 'logged'
                    ? '#6751E8'
                    : theme.colors.textPrimary,
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
              // Dot = what is COMING (frequency). Fill = what was TAKEN. Logged
              // days used to carry a green dot; that colour said nothing the
              // fill does not, and two meanings on one mark read as noise.
              backgroundColor: day.mark === 'due' ? theme.colors.primary : 'transparent',
            }}
          />
        </View>
      ))}
    </View>
  );
}
