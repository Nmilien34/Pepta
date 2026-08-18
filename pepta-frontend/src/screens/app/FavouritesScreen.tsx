// Favourites — one screen behind both star rows, opening on the side you came
// from (design-lab frames "Favourites · food / drinks / first run").
//
// A FAVOURITE LOGS THE PORTION YOU SAVED. Not a category: tapping Log on
// "Chicken breast, 6 oz grilled" logs those numbers, which is the entire
// reason the portion is part of the row rather than a subtitle.
//
// WORTH SAVING is the part that matters. Nobody curates a list, so the screen
// offers what the user has already logged three or more times in a fortnight
// and lets them keep it or ignore it. Nothing is saved on their behalf — an
// empty Favourites screen is a real state, not a bug, and the examples screens
// still work without it.

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { AppText, Card } from '../../components';
import { Icon } from '../../components/Icon';
import { usePeptaData } from '../../context/PeptaDataContext';
import { useLogSheets } from '../../context/LogSheetsContext';
import { useTheme } from '../../theme';
import { useFavourites } from './useFavourites';
import {
  countsByKind,
  favouriteFromOffer,
  favouritesOf,
  worthSaving,
  worthSavingReason,
  type Favourite,
  type FavouriteKind,
} from './favourites';

export type FavouritesParams = { kind?: FavouriteKind };

export function FavouritesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const route = useRoute<RouteProp<Record<string, FavouritesParams>, string>>();
  const { track, bumpWater } = usePeptaData();
  const { openMeal } = useLogSheets();
  const { favourites, save, unsave } = useFavourites();

  // Opens on the side you came from — the star row on Protein lands on Food,
  // the one on Water lands on Drinks.
  const [tab, setTab] = useState<FavouriteKind>(route.params?.kind === 'drink' ? 'drink' : 'food');

  const counts = countsByKind(favourites);
  const rows = favouritesOf(favourites, tab);
  const offers = useMemo(
    () => (tab === 'food' ? worthSaving(track?.mealLogs, favourites, new Date()) : []),
    [tab, track, favourites],
  );

  const logFavourite = (fav: Favourite) => {
    Haptics.selectionAsync().catch(() => undefined);
    if (fav.kind === 'drink') {
      if (fav.ounces != null) bumpWater(fav.ounces);
      return;
    }
    // Food goes through the meal sheet, seeded with the saved portion — the
    // same path as tapping a food on the Protein screen, so a favourite and a
    // one-off land in the log identically.
    openMeal({
      foodName: fav.name,
      servingSize: fav.portion || undefined,
      protein: fav.protein,
      calories: fav.calories,
      fiber: fav.fiber,
    });
  };

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
          <AppText variant="screenTitle">Favourites</AppText>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginTop: 6 }}>
          {(['food', 'drink'] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                setTab(k);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === k }}
              accessibilityLabel={`${k === 'food' ? 'Food' : 'Drinks'}, ${k === 'food' ? counts.food : counts.drink} saved`}
              style={({ pressed }) => ({
                paddingVertical: 7,
                paddingHorizontal: 14,
                borderRadius: theme.radii.pill,
                backgroundColor: tab === k ? theme.colors.textPrimary : theme.colors.surfaceAlt,
                opacity: pressed ? 0.72 : 1,
              })}
            >
              <AppText
                variant="caption"
                style={{ fontWeight: '700', fontSize: 12, color: tab === k ? theme.colors.surface : theme.colors.textSecondary }}
              >
                {k === 'food' ? `Food · ${counts.food}` : `Drinks · ${counts.drink}`}
              </AppText>
            </Pressable>
          ))}
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 28 }}
          showsVerticalScrollIndicator={false}
        >
          {rows.length > 0 ? (
            <Card style={{ marginTop: 14, paddingVertical: 0 }}>
              {rows.map((fav, i) => (
                <View
                  key={fav.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 12,
                    borderBottomWidth: i === rows.length - 1 ? 0 : 0.5,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="cardTitle" style={{ fontSize: 14.5 }} numberOfLines={1}>
                      {fav.name}
                    </AppText>
                    {fav.portion ? (
                      <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 1 }}>
                        {fav.portion}
                      </AppText>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 5 }}>
                      {fav.protein != null ? (
                        <AppText variant="caption" style={{ fontSize: 10.5, fontWeight: '700', color: theme.colors.protein }}>
                          {fav.protein} g protein
                        </AppText>
                      ) : null}
                      {fav.fiber != null ? (
                        <AppText variant="caption" style={{ fontSize: 10.5, fontWeight: '700', color: theme.colors.fiber }}>
                          {fav.fiber} g fiber
                        </AppText>
                      ) : null}
                      {fav.ounces != null ? (
                        <AppText variant="caption" style={{ fontSize: 10.5, fontWeight: '700', color: theme.colors.water }}>
                          {fav.ounces} oz
                        </AppText>
                      ) : null}
                      {fav.calories != null ? (
                        <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5 }}>
                          {fav.calories} cal
                        </AppText>
                      ) : null}
                    </View>
                  </View>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => undefined);
                      unsave(fav.id);
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${fav.name} from favourites`}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                  >
                    <Icon name="star" size={18} color={theme.colors.warning} stroke={2.2} />
                  </Pressable>
                  <Pressable
                    onPress={() => logFavourite(fav)}
                    accessibilityRole="button"
                    accessibilityLabel={`Log ${fav.name}`}
                    style={({ pressed }) => ({
                      paddingVertical: 6,
                      paddingHorizontal: 13,
                      borderRadius: theme.radii.pill,
                      backgroundColor: theme.colors.surfaceAlt,
                      opacity: pressed ? 0.68 : 1,
                    })}
                  >
                    <AppText variant="caption" style={{ fontWeight: '800', fontSize: 11.5 }}>
                      Log
                    </AppText>
                  </Pressable>
                </View>
              ))}
            </Card>
          ) : (
            <Card style={{ marginTop: 14 }}>
              <AppText variant="cardTitle" style={{ fontSize: 15 }}>
                Nothing saved yet
              </AppText>
              <AppText variant="caption" color="textSecondary" style={{ marginTop: 6, lineHeight: 17 }}>
                Star anything as you log it and it lands here, with the portion you used. After
                that it is one tap.
              </AppText>
            </Card>
          )}

          {offers.length > 0 ? (
            <>
              <AppText variant="cardTitle" style={{ fontSize: 15, marginTop: 18 }}>
                Worth saving
              </AppText>
              <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 6, lineHeight: 15 }}>
                You have logged these more than three times. One tap keeps them here.
              </AppText>
              <Card style={{ marginTop: 10, paddingVertical: 0 }}>
                {offers.map((offer, i) => (
                  <View
                    key={offer.key}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingVertical: 12,
                      borderBottomWidth: i === offers.length - 1 ? 0 : 0.5,
                      borderBottomColor: theme.colors.border,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText variant="cardTitle" style={{ fontSize: 14.5 }} numberOfLines={1}>
                        {offer.name}
                      </AppText>
                      <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 1 }}>
                        {worthSavingReason(offer.count)}
                      </AppText>
                    </View>
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => undefined);
                        save(favouriteFromOffer(offer, new Date().toISOString()));
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Save ${offer.name} to favourites`}
                      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                    >
                      <Icon name="star-outline" size={19} color={theme.colors.textTertiary} stroke={2.2} />
                    </Pressable>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {tab === 'drink' ? (
            <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 14, lineHeight: 15 }}>
              Star a drink on the Water screen and it lands here with its volume.
            </AppText>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
