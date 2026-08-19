// "Your log", in full — where See all goes.
//
// WHY A SCREEN AND NOT AN EXPANDING CARD. The card sits in slot 2 on Track,
// above compounds, the level chart, the site map and the mix calculator.
// Expanding it in place pushed all four off the bottom, and a history long
// enough to be worth opening is long enough to want its own scroll and a Back
// button. Nothing new is fetched: /track's payload already holds it.
//
// The rows are the card's rows — same component, so the two cannot drift.

import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityFeedCard, AppText, LogFilterSheet, Mascot, ShotDetailSheet } from '../../components';
import { Icon } from '../../components/Icon';
import { usePeptaData } from '../../context/PeptaDataContext';
import { useTheme } from '../../theme';
import { buildActivityFeed, FULL_FEED_DAYS } from './activityFeed';
import {
  NO_FILTER,
  emptyLine,
  entryCount,
  filterFeed,
  groupCounts,
  isFiltered,
  scopeLabel,
  type LogFilter,
} from './logFilters';
import { buildShotWindow } from './shotDetail';

export function ActivityLogScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavigationProp<Record<string, undefined>>>();
  const { home, track, trackRefreshing, refreshTrack, refreshHome } = usePeptaData();
  const [openShotId, setOpenShotId] = useState<string | null>(null);
  const [filter, setFilter] = useState<LogFilter>(NO_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);

  const all = useMemo(
    () => buildActivityFeed({ track, home, maxDays: FULL_FEED_DAYS }),
    [track, home],
  );
  const days = useMemo(() => filterFeed(all, filter), [all, filter]);
  const counts = useMemo(() => groupCounts(all, filter.scope), [all, filter.scope]);
  const openShot = useMemo(
    () => (openShotId ? buildShotWindow({ doseId: openShotId, track, home }) : null),
    [openShotId, track, home],
  );

  const shown = entryCount(days);
  const filtered = isFiltered(filter);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={trackRefreshing}
              onRefresh={() => {
                void Promise.all([refreshTrack(), refreshHome()]);
              }}
              tintColor={theme.colors.primary}
            />
          }
        >
          {/* The sub-screen header idiom, matching Mix calculator: a back
              chevron beside the title rather than Track's scope pill. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 10 }}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                navigation.goBack();
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="chevron-back" size={25} color={theme.colors.textSecondary} stroke={2.4} />
            </Pressable>
            <AppText variant="screenTitle" style={{ fontSize: 24, flex: 1 }} numberOfLines={1}>
              Your log
            </AppText>

            {/* The frame's two header controls, both real. The pill says what
                window you are looking at; the button says what kinds. They
                open the same sheet because they are one question. */}
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                setFilterOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Change the time range, showing ${scopeLabel(filter.scope).toLowerCase()}`}
              hitSlop={6}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingVertical: 7,
                  paddingHorizontal: 11,
                  borderRadius: theme.radii.pill,
                  backgroundColor: theme.colors.surface,
                  borderWidth: 0.5,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
                theme.shadows.card,
              ]}
            >
              <Icon name="calendar" size={14} color={theme.colors.textSecondary} stroke={2.1} />
              <AppText variant="caption" style={{ fontWeight: '700', fontSize: 13 }}>
                {scopeLabel(filter.scope)}
              </AppText>
              <Icon name="chevron-down" size={13} color={theme.colors.textTertiary} stroke={2.2} />
            </Pressable>

            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                setFilterOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={
                filter.groups.length > 0
                  ? `Filter, ${filter.groups.length} on`
                  : 'Filter what this shows'
              }
              style={({ pressed }) => ({
                width: 34,
                height: 34,
                borderRadius: theme.radii.pill,
                backgroundColor: filter.groups.length > 0 ? theme.colors.primary : theme.colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Icon
                name="adjustments-horizontal"
                size={18}
                color={filter.groups.length > 0 ? theme.colors.onPrimary : theme.colors.textSecondary}
              />
            </Pressable>
          </View>

          {shown > 0 ? (
            <AppText variant="caption" color="textTertiary" style={{ marginTop: 6 }}>
              {shown} {shown === 1 ? 'entry' : 'entries'} across {days.length}{' '}
              {days.length === 1 ? 'day' : 'days'}
            </AppText>
          ) : null}

          <View style={{ marginTop: theme.spacing.md }}>
            {days.length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 48, gap: 14 }}>
                <Mascot pose="idle" size={110} />
                <AppText variant="cardTitle" align="center">
                  {/* Says WHICH nothing: filtered out, or never logged. */}
                  {emptyLine(filter)}
                </AppText>
                {filtered ? (
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => undefined);
                      setFilter(NO_FILTER);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Clear filters"
                    hitSlop={8}
                  >
                    <AppText variant="body" color="primary" style={{ fontWeight: '700' }}>
                      Clear filters
                    </AppText>
                  </Pressable>
                ) : (
                  <AppText
                    variant="body"
                    color="textSecondary"
                    align="center"
                    style={{ maxWidth: 260 }}
                  >
                    Everything you record — shots, weight, protein, water, side effects — lands
                    here, newest first.
                  </AppText>
                )}
              </View>
            ) : (
              <ActivityFeedCard bare days={days} onOpenShot={setOpenShotId} />
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      <LogFilterSheet
        visible={filterOpen}
        filter={filter}
        counts={counts}
        resultCount={shown}
        onChange={setFilter}
        onClose={() => setFilterOpen(false)}
      />

      <ShotDetailSheet
        shot={openShot}
        visible={openShot != null}
        onClose={() => setOpenShotId(null)}
      />
    </View>
  );
}
