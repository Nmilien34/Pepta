// "Your log" — the frame's slot-2 card, and the same rows on their own screen.
//
// ONE COMPONENT, TWO PLACES. The card on Track shows the last few days; See
// all pushes a screen showing the lot. They must not drift: a row that reads
// one way in the card and another on the screen is two implementations of the
// same list, and only one of them gets fixed when something is wrong.
//
// The card version takes `onSeeAll`; the screen version takes neither that nor
// a cap, and renders whatever it is handed.

import React from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppText } from './AppText';
import { Card } from './Card';
import { Icon } from './Icon';
import { useTheme } from '../theme';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import {
  entryTime,
  type ActivityDay,
  type ActivityEntry,
  type ActivityKind,
} from '../screens/app/activityFeed';

export const ACTIVITY_ICON: Record<ActivityKind, { name: string; bg: string; fg: string }> = {
  dose: { name: 'needle', bg: '#EFEBFF', fg: '#6751E8' },
  weight: { name: 'scale', bg: '#F2F3F5', fg: '#52525B' },
  protein: { name: 'food-drumstick', bg: '#FFEDE0', fg: '#D2691E' },
  water: { name: 'water', bg: '#E3F2FF', fg: '#2A8FD8' },
  meal: { name: 'nutrition', bg: '#E8F8EE', fg: '#1E8E40' },
  sideEffect: { name: 'alert-circle-outline', bg: '#FFF4E5', fg: '#B87514' },
  activity: { name: 'pulse', bg: '#FFE9EC', fg: '#C2415A' },
  measurement: { name: 'chart-line', bg: '#F2F3F5', fg: '#52525B' },
};

export function ActivityFeedCard({
  days,
  onSeeAll,
  onOpenShot,
  onRemove,
  /** The screen version drops the card chrome — it IS the screen. */
  bare = false,
}: {
  days: ActivityDay[];
  /** Absent on the full screen: there is nowhere further to go. */
  onSeeAll?: () => void;
  onOpenShot(doseId: string): void;
  /**
   * Absent on the Track card. Removing a record is a deliberate act, and the
   * card is a three-day glance you scroll past — the full screen is where you
   * go to manage your history.
   */
  onRemove?: (entry: ActivityEntry) => void;
  bare?: boolean;
}) {
  const theme = useTheme();
  const Frame = bare ? View : Card;
  return (
    <Frame>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          display: bare ? 'none' : 'flex',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <Icon name="history" size={18} color={theme.colors.textSecondary} />
          <AppText variant="cardTitle" style={{ fontSize: 15 }} numberOfLines={1}>
            Your log
          </AppText>
        </View>
        {/* A screen, not an in-place expansion. The card shows the last few
            days; a full history is a place you go, can scroll properly, and
            can leave with Back — expanding a card in slot 2 pushed the four
            cards below it off the bottom of Track. */}
        {onSeeAll ? (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              onSeeAll();
            }}
            accessibilityRole="button"
            accessibilityLabel="See your whole log"
            hitSlop={10}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, flexShrink: 0 })}
          >
            <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
              See all
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {days.length === 0 ? (
        <AppText variant="body" color="textSecondary" style={{ marginTop: theme.spacing.md }}>
          Nothing logged yet.
        </AppText>
      ) : (
        days.map((day) => (
          <View key={day.date}>
            <AppText
              variant="sectionHeader"
              color="textTertiary"
              style={{ textTransform: 'uppercase', marginTop: theme.spacing.md }}
            >
              {day.label}
            </AppText>
            {day.entries.map((entry, index) => {
              const icon = ACTIVITY_ICON[entry.kind];
              // ONLY DOSES OPEN. Every other row is a single number with
              // nothing behind it; a chevron on all of them would promise
              // detail that does not exist.
              const opens = entry.kind === 'dose';
              const doseId = opens ? entry.id.replace(/^dose-/, '') : null;
              const row = (
                <Pressable
                  key={entry.id}
                  onPress={() => {
                    if (!doseId) return;
                    Haptics.selectionAsync().catch(() => undefined);
                    onOpenShot(doseId);
                  }}
                  disabled={!opens}
                  accessibilityRole={opens ? 'button' : undefined}
                  accessibilityLabel={opens ? `${entry.title} — see how this shot went` : undefined}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 11,
                    paddingVertical: 11,
                    borderBottomWidth: index < day.entries.length - 1 ? 0.5 : 0,
                    borderBottomColor: theme.colors.border,
                    opacity: pressed && opens ? 0.6 : 1,
                  })}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: icon.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={icon.name} size={16} color={icon.fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" style={{ fontWeight: '700' }}>
                      {entry.title}
                    </AppText>
                    {entry.detail ? (
                      <AppText variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
                        {entry.detail}
                      </AppText>
                    ) : null}
                  </View>
                  <AppText variant="caption" color="textTertiary" style={{ fontWeight: '600' }}>
                    {entry.timeLabel ?? entryTime(entry.datetime)}
                  </AppText>
                  {opens ? (
                    <Icon name="chevron-forward" size={14} color={theme.colors.textTertiary} />
                  ) : null}
                </Pressable>
              );

              // Swipe rather than a visible button: the frame has no delete
              // affordance, and a row of X's would make a history screen look
              // like a to-do list. The gesture is the same one Favourites
              // uses, so it is already learned.
              if (!onRemove) return row;
              return (
                <ReanimatedSwipeable
                  key={entry.id}
                  friction={2}
                  rightThreshold={36}
                  renderRightActions={() => (
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => undefined);
                        onRemove(entry);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${entry.title}`}
                      style={({ pressed }) => ({
                        justifyContent: 'center',
                        paddingHorizontal: 18,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <AppText variant="caption" style={{ fontWeight: '800', color: theme.colors.danger }}>
                        Remove
                      </AppText>
                    </Pressable>
                  )}
                >
                  {row}
                </ReanimatedSwipeable>
              );
            })}
          </View>
        ))
      )}
    </Frame>
  );
}

