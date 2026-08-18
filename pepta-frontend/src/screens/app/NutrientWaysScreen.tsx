// "Ways to hit it" — one screen, two nutrients (design-lab frames "Protein ·
// ways to hit it" and "Fiber · ways to hit it").
//
// Reached by tapping the Fiber or Protein tile in the Home shortcuts grid.
// Today's number at the top so the screen answers "how am I doing" before it
// answers "what could I eat", then the photos, then the same foods as a list
// with the servings spelled out.
//
// The progress figures are the user's own, from the same view-model Home reads
// — this screen is a second window onto today, not a static reference page.

import React, { useEffect } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { AppText, Card, ProgressBar } from '../../components';
import { Icon } from '../../components/Icon';
import { usePeptaData } from '../../context/PeptaDataContext';
import { useLogSheets } from '../../context/LogSheetsContext';
import { useTheme } from '../../theme';
import { todayStat } from './homeView';
import { useTodayRefresh } from './useTodayRefresh';
import { FOOD_PHOTOS } from './nutrientPhotos';
import {
  foodsFor,
  gramsLabel,
  waysHeadline,
  type NutrientFood,
  type NutrientKind,
} from './nutrientWays';

export type NutrientWaysParams = { kind: NutrientKind };

const TITLES: Record<NutrientKind, string> = { fiber: 'Fiber', protein: 'Protein' };

/**
 * The one line of why. Fiber gets it because constipation is the side effect
 * people are actually living with and do not connect to fiber; protein does
 * not, because "eat protein" needs no defending.
 */
const NOTES: Partial<Record<NutrientKind, string>> = {
  fiber:
    'Constipation is one of the most common GLP‑1 side effects — fiber and water together are what help.',
};

export function NutrientWaysScreen() {
  const theme = useTheme();
  // The bottom inset, not a fixed number. This screen is PUSHED over the tabs,
  // so there is no tab bar underneath to hold the last card clear of the home
  // indicator — a hard 40 leaves it sitting on the bar on every modern iPhone.
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const route = useRoute<RouteProp<Record<string, NutrientWaysParams>, string>>();
  const kind: NutrientKind = route.params?.kind === 'protein' ? 'protein' : 'fiber';
  const { home, refreshHome } = usePeptaData();
  const todayRefresh = useTodayRefresh();
  const { openMeal } = useLogSheets();

  const tint = kind === 'fiber' ? theme.colors.fiber : theme.colors.protein;
  // A cold entry — deep link, or the cache never hydrated — must not render
  // zeros next to "Set a daily target". That reads as "you have no goal" when
  // the truth is "we have not loaded yet".
  useEffect(() => {
    if (!home) void refreshHome();
  }, [home, refreshHome]);

  // Today's own numbers — never the range Home happens to be showing.
  const stat = home ? todayStat(home, kind) : null;
  const target = stat?.target ?? null;
  const head = target != null ? waysHeadline(kind, stat?.current ?? 0, target) : null;

  const openFood = (food: NutrientFood) => {
    Haptics.selectionAsync().catch(() => undefined);
    // No item-detail screen yet, so the photo opens the sheet that can act on
    // it. A tap that only enlarges a picture would be the weaker door.
    openMeal();
  };

  if (!home) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={tint} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 6 }}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Icon name="chevron-back" size={25} color={theme.colors.textSecondary} stroke={2.4} />
          </Pressable>
          <AppText variant="screenTitle">{TITLES[kind]}</AppText>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 28 }} showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={todayRefresh.refreshing}
              onRefresh={todayRefresh.onRefresh}
              tintColor={tint}
            />
          }
        >
          {head ? (
            <Card style={{ marginTop: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <Icon name={kind === 'fiber' ? 'leaf' : 'food-drumstick'} size={17} color={tint} stroke={2.3} />
                  <AppText variant="cardTitle" style={{ fontSize: 15 }}>Today</AppText>
                </View>
                <View style={{ backgroundColor: theme.colors.surfaceAlt, paddingVertical: 4, paddingHorizontal: 10, borderRadius: theme.radii.pill }}>
                  <AppText variant="caption" color="textSecondary" style={{ fontWeight: '600', fontSize: 12 }}>{head.pill}</AppText>
                </View>
              </View>
              <View style={{ marginTop: 12 }}>
                <ProgressBar pct={head.pct} color={tint} height={7} />
              </View>
              <AppText variant="caption" color="textTertiary" style={{ marginTop: 8, lineHeight: 16 }}>
                {head.line}
              </AppText>
            </Card>
          ) : (
            <Card style={{ marginTop: 12 }}>
              <AppText variant="caption" color="textSecondary" style={{ lineHeight: 17 }}>
                Set a daily {TITLES[kind].toLowerCase()} target in your profile and today's number shows up here.
              </AppText>
            </Card>
          )}

          <AppText variant="cardTitle" style={{ fontSize: 15, marginTop: 16 }}>
            Easy ways to hit {kind}
          </AppText>
          {NOTES[kind] ? (
            <AppText variant="caption" color="textTertiary" style={{ marginTop: 6, lineHeight: 16 }}>
              {NOTES[kind]}
            </AppText>
          ) : null}

          {/* The strip, in list order — the same order as the rows below it,
              which is what the design frames show. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 10, paddingRight: 20 }}
            style={{ marginHorizontal: -20, paddingLeft: 20 }}
          >
            {foodsFor(kind).map((food) => (
              <Pressable
                key={food.key}
                onPress={() => openFood(food)}
                accessibilityRole="button"
                accessibilityLabel={`${food.name}, ${gramsLabel(food.amount)} of ${kind}`}
                style={({ pressed }) => ({ width: 56, alignItems: 'center', gap: 5, opacity: pressed ? 0.7 : 1 })}
              >
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    overflow: 'hidden',
                    borderWidth: 2,
                    borderColor: theme.colors.surface,
                    shadowColor: '#282018',
                    shadowOpacity: 0.16,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 2 },
                  }}
                >
                  <Image source={FOOD_PHOTOS[food.key]} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
                </View>
                <AppText variant="caption" color="textSecondary" align="center" style={{ fontSize: 9, fontWeight: '700', lineHeight: 10.5 }}>
                  {gramsLabel(food.amount)}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>

          <Card style={{ marginTop: 4, paddingVertical: 0 }}>
            {foodsFor(kind).map((food, i, all) => (
              <Pressable
                key={food.key}
                onPress={() => openFood(food)}
                accessibilityRole="button"
                accessibilityLabel={`${food.name}, ${food.serving}, ${gramsLabel(food.amount)} of ${kind}`}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 11,
                  borderBottomWidth: i === all.length - 1 ? 0 : 0.5,
                  borderBottomColor: theme.colors.border,
                  opacity: pressed ? 0.68 : 1,
                })}
              >
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    overflow: 'hidden',
                    shadowColor: '#282018',
                    shadowOpacity: 0.14,
                    shadowRadius: 3,
                    shadowOffset: { width: 0, height: 1 },
                  }}
                >
                  <Image source={FOOD_PHOTOS[food.key]} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {/* Brand as written: the frames show "fairlife" and
                      "GoodSense", not FAIRLIFE and GOODSENSE. */}
                  {food.brand ? (
                    <AppText variant="caption" color="textTertiary" style={{ fontSize: 10, fontWeight: '700' }}>
                      {food.brand}
                    </AppText>
                  ) : null}
                  <AppText variant="cardTitle" style={{ fontSize: 14.5 }} numberOfLines={1}>
                    {food.name}
                  </AppText>
                  <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 1 }}>
                    {food.serving}
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 5 }}>
                    <AppText variant="caption" style={{ fontSize: 10.5, fontWeight: '700', color: tint }}>
                      {gramsLabel(food.amount)} {kind}
                    </AppText>
                    <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5 }}>
                      {food.calories} cal
                    </AppText>
                  </View>
                </View>
                {/* A plus, tinted. The row's action is "add this", and a
                    chevron would promise a detail screen that does not exist. */}
                <Icon name="add" size={17} color={tint} stroke={2} />
              </Pressable>
            ))}
          </Card>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
