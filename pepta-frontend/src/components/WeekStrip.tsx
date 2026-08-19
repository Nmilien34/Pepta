// Week strip inside the Track Next-dose card — the hub's `.wks` idiom, in its
// Wellspoken shape: a tile per day carrying the state as a MARK, not as a
// colour on a number.
//
// WHY THE NUMBERS WENT. The previous strip tinted a day number: light purple
// meant taken, a purple dot underneath meant due, and nothing at all meant
// either "rest day" or "you were meant to dose and didn't". Those last two
// look identical, and they are the one pair somebody checking their protocol
// actually needs told apart. A mark can say four things where a tinted number
// could say two:
//
//   taken     filled circle, white check
//   due       hollow circle, thick primary ring — planned, still ahead
//   missed    flat grey circle, grey cross — planned, past, never logged
//   resting   hollow circle, thin grey ring — nothing was planned
//
// Today is the tile that changes, not the mark: a lilac tile with its name in
// primary, so "today" and "taken" can both be true without two marks fighting.
//
// Pure presentation; days come from scheduleView.weekStrip.

import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AppText } from './AppText';
import { useTheme } from '../theme';
import type { StripDay } from '../screens/app/scheduleView';

const MARK_SIZE = 23;

function Check({ color }: { color: string }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 12.5l5 5L19 7"
        stroke={color}
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function Cross({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={3.2} strokeLinecap="round" />
    </Svg>
  );
}

/** What a screen reader says for the tile — the mark is the whole message. */
function markLabel(day: StripDay): string {
  const when = day.isToday ? `${day.name}, today` : day.name;
  switch (day.mark) {
    case 'logged':
      return `${when}, taken`;
    case 'due':
      return `${when}, due`;
    case 'missed':
      return `${when}, nothing logged`;
    default:
      return `${when}, nothing planned`;
  }
}

export function WeekStrip({ days }: { days: StripDay[] }) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 4,
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 0.5,
        borderTopColor: theme.colors.border,
      }}
    >
      {days.map((day) => {
        const taken = day.mark === 'logged';
        const missed = day.mark === 'missed';
        return (
          <View
            key={day.date}
            accessible
            accessibilityLabel={markLabel(day)}
            style={{
              flex: 1,
              minWidth: 0,
              alignItems: 'center',
              gap: 5,
              paddingTop: 7,
              paddingBottom: 6,
              borderRadius: 12,
              backgroundColor: day.isToday ? '#EFEBFF' : theme.colors.surfaceAlt,
            }}
          >
            <View
              style={{
                width: MARK_SIZE,
                height: MARK_SIZE,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: taken
                  ? theme.colors.primary
                  : missed
                    ? theme.colors.surfaceAlt
                    : theme.colors.surface,
                // Ring weight carries the difference between "coming" and
                // "nothing planned" — thick and primary against thin and grey.
                borderWidth: day.mark === 'due' ? 3.4 : day.mark === 'none' ? 2.8 : 0,
                borderColor: day.mark === 'due' ? theme.colors.primary : theme.colors.border,
              }}
            >
              {taken ? <Check color={theme.colors.onPrimary} /> : null}
              {missed ? <Cross color={theme.colors.textTertiary} /> : null}
            </View>
            <AppText
              variant="caption"
              style={{
                fontSize: 9,
                fontWeight: '800',
                letterSpacing: 0.2,
                color: day.isToday ? theme.colors.primary : theme.colors.textTertiary,
              }}
              numberOfLines={1}
            >
              {day.name}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}
