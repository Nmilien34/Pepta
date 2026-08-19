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
import { ActivityFeedCard, AppText, Mascot, ShotDetailSheet } from '../../components';
import { Icon } from '../../components/Icon';
import { usePeptaData } from '../../context/PeptaDataContext';
import { useTheme } from '../../theme';
import { buildActivityFeed, FULL_FEED_DAYS } from './activityFeed';
import { buildShotWindow } from './shotDetail';

export function ActivityLogScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavigationProp<Record<string, undefined>>>();
  const { home, track, trackRefreshing, refreshTrack, refreshHome } = usePeptaData();
  const [openShotId, setOpenShotId] = useState<string | null>(null);

  const days = useMemo(
    () => buildActivityFeed({ track, home, maxDays: FULL_FEED_DAYS }),
    [track, home],
  );
  const openShot = useMemo(
    () => (openShotId ? buildShotWindow({ doseId: openShotId, track, home }) : null),
    [openShotId, track, home],
  );

  const entryCount = days.reduce((total, day) => total + day.entries.length, 0);

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
            <AppText variant="screenTitle" style={{ fontSize: 24 }}>
              Your log
            </AppText>
          </View>

          {entryCount > 0 ? (
            <AppText variant="caption" color="textTertiary" style={{ marginTop: 6 }}>
              {entryCount} {entryCount === 1 ? 'entry' : 'entries'} across {days.length}{' '}
              {days.length === 1 ? 'day' : 'days'}
            </AppText>
          ) : null}

          <View style={{ marginTop: theme.spacing.md }}>
            {days.length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 48, gap: 14 }}>
                <Mascot pose="idle" size={110} />
                <AppText variant="cardTitle" align="center">
                  Nothing logged yet
                </AppText>
                <AppText
                  variant="body"
                  color="textSecondary"
                  align="center"
                  style={{ maxWidth: 260 }}
                >
                  Everything you record — shots, weight, protein, water, side effects — lands
                  here, newest first.
                </AppText>
              </View>
            ) : (
              <ActivityFeedCard bare days={days} onOpenShot={setOpenShotId} />
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      <ShotDetailSheet
        shot={openShot}
        visible={openShot != null}
        onClose={() => setOpenShotId(null)}
      />
    </View>
  );
}
