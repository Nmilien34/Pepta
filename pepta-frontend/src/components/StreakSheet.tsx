// StreakSheet — what the flame in the Home header opens.
//
// The streak has been computed on the server since the beginning and shown as
// a bare number with nowhere to go. A number you cannot inspect is a number
// you cannot trust: "1" tells you nothing about whether you have been at this
// for a fortnight or started this morning, and nothing about WHICH habit is
// carrying it.
//
// THE HEADLINE IS THE SERVER'S NUMBER, passed straight through. This sheet
// must never contradict the flame that opened it, so it does not recompute the
// count it is explaining — see streaks.ts. Everything else here is detail the
// server does not send: the best run, which days are lit, and the per-habit
// breakdown.

import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme';
import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';
import type { HabitStreak, StreakDay } from '../screens/app/streaks';

export interface StreakSheetProps {
  visible: boolean;
  onClose(): void;
  /** The server's count — the same number the header flame shows. */
  streakDays: number;
  /** Whether anything has been logged today, for the state line. */
  loggedToday: boolean;
  bestStreak: number;
  days: StreakDay[];
  habits: HabitStreak[];
}

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function dayInitial(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return '';
  return WEEKDAY[new Date(year, month - 1, date).getDay()] ?? '';
}

export function StreakSheet({
  visible,
  onClose,
  streakDays,
  loggedToday,
  bestStreak,
  days,
  habits,
}: StreakSheetProps) {
  const theme = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose} scrollable avoidKeyboard={false}>
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="fire" size={24} color={theme.colors.streak} />
          <AppText variant="cardTitle" style={{ fontSize: 26, letterSpacing: -0.6, lineHeight: 32 }}>
            {streakDays}
            <AppText variant="caption" color="textSecondary" style={{ fontSize: 15, fontWeight: '700' }}>
              {streakDays === 1 ? ' day' : ' days'}
            </AppText>
          </AppText>
        </View>

        {/* The state line, not a slogan. On a morning the run is still alive
            but today is not logged yet, and saying so is the difference
            between a nudge and a lie. */}
        <AppText variant="caption" color="textSecondary" style={{ marginTop: 5 }}>
          {streakDays === 0
            ? 'Log anything today to start a streak.'
            : loggedToday
              ? 'Logged today — the run continues.'
              : 'Log anything today to keep it.'}
        </AppText>

        {/* The run, made visible. A count says "7"; the grid shows the shape —
            which days were missed, and whether this is a habit or a spike. */}
        <View style={{ marginTop: 18 }}>
          <AppText variant="caption" color="textTertiary" style={{ fontWeight: '700', fontSize: 11 }}>
            LAST 4 WEEKS
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
            {days.map((day) => (
              <View key={day.day} style={{ alignItems: 'center', width: 34 }}>
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: day.lit ? theme.colors.streak : theme.colors.surfaceAlt,
                    // Today is ringed rather than recoloured, so "lit" keeps
                    // meaning exactly one thing.
                    borderWidth: day.isToday ? 2 : 0,
                    borderColor: theme.colors.textPrimary,
                  }}
                >
                  <AppText
                    variant="caption"
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: day.lit ? theme.colors.onPrimary : theme.colors.textTertiary,
                    }}
                  >
                    {dayInitial(day.day)}
                  </AppText>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 18,
            paddingTop: 13,
            borderTopWidth: 0.5,
            borderTopColor: theme.colors.border,
          }}
        >
          <AppText variant="caption" color="textSecondary" style={{ fontWeight: '700' }}>
            Best streak
          </AppText>
          <AppText variant="bodyStrong" style={{ fontWeight: '800' }}>
            {bestStreak} {bestStreak === 1 ? 'day' : 'days'}
          </AppText>
        </View>

        {/* PER HABIT. The header number answers "am I showing up"; this
            answers "at what" — a 12-day run carried entirely by water, with
            meals at zero, is the thing worth acting on. */}
        <View style={{ marginTop: 18 }}>
          <AppText variant="caption" color="textTertiary" style={{ fontWeight: '700', fontSize: 11 }}>
            BY WHAT YOU LOG
          </AppText>
          {habits.map((habit, index) => (
            <View
              key={habit.key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 11,
                borderTopWidth: index > 0 ? 0.5 : 0,
                borderTopColor: theme.colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 7,
                    backgroundColor: habit.loggedToday ? theme.colors.streak : theme.colors.border,
                  }}
                />
                <AppText variant="bodyStrong" style={{ fontWeight: '700', fontSize: 14 }}>
                  {habit.label}
                </AppText>
              </View>
              <AppText
                variant="caption"
                color={habit.current > 0 ? 'textPrimary' : 'textTertiary'}
                style={{ fontWeight: '800' }}
              >
                {habit.current === 0 ? '—' : `${habit.current}d`}
              </AppText>
            </View>
          ))}
        </View>
      </View>
    </BottomSheet>
  );
}
