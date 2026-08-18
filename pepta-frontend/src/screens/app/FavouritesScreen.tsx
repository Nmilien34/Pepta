// Favourites — one screen behind both star rows, opening on the side you came
// from (design-lab frames "Favourites · food / drinks / first run").
//
// A FAVOURITE LOGS THE PORTION YOU SAVED. Not a category: tapping Log on
// "Chicken breast, 6 oz grilled" logs those numbers. That is why the portion
// is part of the row rather than a subtitle, and why two sizes of one food are
// two favourites.
//
// DRINKS CARRY THE VESSEL DRAWING rather than an icon — the same shapes as
// Quick add on the Water screen, so a favourite reads as the thing you
// actually pick up, and the favourite and the shortcut look like one idea.
//
// WORTH SAVING FILLS ITSELF from what the user already logs, so nobody has to
// curate a list. Nothing is saved on their behalf: an empty Favourites screen
// is a real state, not a bug, and "Start with these" saves only what is
// tapped.

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { AppText, Card } from '../../components';
import { Icon } from '../../components/Icon';
import { VesselIcon } from '../../components/VesselIcon';
import { usePeptaData } from '../../context/PeptaDataContext';
import { useLogSheets } from '../../context/LogSheetsContext';
import { useTheme } from '../../theme';
import { useFavourites } from './useFavourites';
import { vesselForOunces, vesselNameForExactOunces } from './hydration';
import {
  countsByKind,
  favouriteFromDrinkOffer,
  favouriteFromOffer,
  favouritesOf,
  startingSuggestions,
  worthSaving,
  worthSavingDrinks,
  worthSavingReason,
  type Favourite,
  type FavouriteKind,
} from './favourites';

export type FavouritesParams = { kind?: FavouriteKind };

/** Warm peach behind food, pale blue behind drinks — the frame's tints. */
const FOOD_TINT = '#FFF1E6';
const DRINK_TINT = '#E8F4FF';

export function FavouritesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const route = useRoute<RouteProp<Record<string, FavouritesParams>, string>>();
  const { track, bumpWater } = usePeptaData();
  const { openMeal, openQuickLog } = useLogSheets();
  const { favourites, save, unsave } = useFavourites();

  // Opens on the side you came from: the star row on Protein and Fiber lands
  // on Food, the one on Water lands on Drinks.
  const [tab, setTab] = useState<FavouriteKind>(route.params?.kind === 'drink' ? 'drink' : 'food');
  const [editing, setEditing] = useState(false);

  const counts = countsByKind(favourites);
  const rows = favouritesOf(favourites, tab);
  const offers = useMemo(
    () => (tab === 'food' ? worthSaving(track?.mealLogs, favourites, new Date()) : []),
    [tab, track, favourites],
  );
  // Drinks are grouped by the VOLUME being repeated — water logs carry no
  // product name, so the amount is the thing actually habitual.
  const drinkOffers = useMemo(
    () =>
      tab === 'drink'
        ? worthSavingDrinks(track?.waterLogs, favourites, new Date(), vesselNameForExactOunces)
        : [],
    [tab, track, favourites],
  );
  const suggestions = startingSuggestions(favourites, tab);
  const tint = tab === 'food' ? FOOD_TINT : DRINK_TINT;
  const accent = tab === 'food' ? theme.colors.protein : theme.colors.water;

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
          {rows.length > 0 ? (
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                setEditing((v) => !v);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: editing }}
              accessibilityLabel={editing ? 'Done editing' : 'Edit'}
              style={({ pressed }) => ({
                marginLeft: 'auto',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: theme.radii.pill,
                backgroundColor: theme.colors.surfaceAlt,
                opacity: pressed ? 0.68 : 1,
              })}
            >
              <Icon name={editing ? 'checkmark' : 'create-outline'} size={13} color={theme.colors.textSecondary} stroke={2.2} />
              <AppText variant="caption" color="textSecondary" style={{ fontSize: 11.5, fontWeight: '700' }}>
                {editing ? 'Done' : 'Edit'}
              </AppText>
            </Pressable>
          ) : null}
        </View>

        {/* Segmented, not two pills: one control with one selection. */}
        <View
          style={{
            flexDirection: 'row',
            gap: 3,
            padding: 3,
            marginHorizontal: 20,
            marginTop: 12,
            borderRadius: 14,
            backgroundColor: theme.colors.surfaceAlt,
          }}
        >
          {(['food', 'drink'] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                setTab(k);
                setEditing(false);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === k }}
              accessibilityLabel={`${k === 'food' ? 'Food' : 'Drinks'}, ${k === 'food' ? counts.food : counts.drink} saved`}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 8,
                borderRadius: 11,
                alignItems: 'center',
                backgroundColor: tab === k ? theme.colors.surface : 'transparent',
                ...(tab === k
                  ? {
                      shadowColor: '#282018',
                      shadowOpacity: 0.1,
                      shadowRadius: 3,
                      shadowOffset: { width: 0, height: 1 },
                    }
                  : {}),
                opacity: pressed ? 0.72 : 1,
              })}
            >
              <AppText
                variant="caption"
                style={{
                  fontSize: 12.5,
                  fontWeight: tab === k ? '800' : '700',
                  color: tab === k ? theme.colors.textPrimary : theme.colors.textTertiary,
                }}
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
            <Card style={{ marginTop: 12, paddingVertical: 0 }}>
              {rows.map((fav, i) => (
                <View
                  key={fav.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 11,
                    paddingVertical: 11,
                    borderBottomWidth: i === rows.length - 1 ? 0 : 0.5,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <Leading fav={fav} tint={tint} accent={accent} />
                  <FavouriteBody fav={fav} accent={accent} />
                  {editing ? (
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
                      <Icon name="close-circle" size={22} color={theme.colors.danger} stroke={2} />
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => logFavourite(fav)}
                      accessibilityRole="button"
                      accessibilityLabel={`Log ${fav.name}`}
                      style={({ pressed }) => ({
                        paddingVertical: 7,
                        paddingHorizontal: 13,
                        borderRadius: theme.radii.pill,
                        backgroundColor: tint,
                        opacity: pressed ? 0.68 : 1,
                      })}
                    >
                      <AppText variant="caption" style={{ fontWeight: '800', fontSize: 11.5, color: accent }}>
                        Log
                      </AppText>
                    </Pressable>
                  )}
                </View>
              ))}
            </Card>
          ) : (
            <Card style={{ marginTop: 12 }}>
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
              <AppText variant="cardTitle" style={{ fontSize: 15, marginTop: 16 }}>
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
                      gap: 11,
                      paddingVertical: 11,
                      borderBottomWidth: i === offers.length - 1 ? 0 : 0.5,
                      borderBottomColor: theme.colors.border,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText variant="cardTitle" style={{ fontSize: 14 }} numberOfLines={1}>
                        {offer.name}
                      </AppText>
                      <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 2 }}>
                        {worthSavingReason(offer.count)}
                      </AppText>
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 5 }}>
                        {offer.protein != null ? (
                          <AppText variant="caption" style={{ fontSize: 10.5, fontWeight: '700', color: theme.colors.protein }}>
                            {offer.protein} g protein
                          </AppText>
                        ) : null}
                        {offer.calories != null ? (
                          <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5 }}>
                            {offer.calories} cal
                          </AppText>
                        ) : null}
                      </View>
                    </View>
                    <KeepButton
                      label={`Save ${offer.name} to favourites`}
                      onPress={() => save(favouriteFromOffer(offer, new Date().toISOString()))}
                    />
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {drinkOffers.length > 0 ? (
            <>
              <AppText variant="cardTitle" style={{ fontSize: 15, marginTop: 16 }}>
                Worth saving
              </AppText>
              <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 6, lineHeight: 15 }}>
                Drinks you keep adding by hand. Save one and it joins Quick add too.
              </AppText>
              <Card style={{ marginTop: 10, paddingVertical: 0 }}>
                {drinkOffers.map((offer, i) => (
                  <View
                    key={offer.key}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 11,
                      paddingVertical: 11,
                      borderBottomWidth: i === drinkOffers.length - 1 ? 0 : 0.5,
                      borderBottomColor: theme.colors.border,
                    }}
                  >
                    <View style={{ width: 40, alignItems: 'center', justifyContent: 'center' }}>
                      <VesselIcon vessel={vesselForOunces(offer.ounces)} water={accent} width={30} height={36} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText variant="cardTitle" style={{ fontSize: 14 }} numberOfLines={1}>
                        {offer.name}
                      </AppText>
                      <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 2 }}>
                        {worthSavingReason(offer.count)}
                      </AppText>
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 5 }}>
                        <AppText variant="caption" style={{ fontSize: 10.5, fontWeight: '700', color: accent }}>
                          {offer.ounces} oz
                        </AppText>
                      </View>
                    </View>
                    <KeepButton
                      label={`Save ${offer.name} to favourites`}
                      onPress={() => save(favouriteFromDrinkOffer(offer, new Date().toISOString()))}
                    />
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {/* Only before anything is saved — a dead end is worse than a nudge. */}
          {suggestions.length > 0 ? (
            <>
              <AppText variant="cardTitle" style={{ fontSize: 15, marginTop: 16 }}>
                Start with these
              </AppText>
              <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 6, lineHeight: 15 }}>
                The three most-logged items across Pepta. Keep what fits, ignore the rest.
              </AppText>
              <Card style={{ marginTop: 10, paddingVertical: 0 }}>
                {suggestions.map((s, i) => (
                  <View
                    key={s.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 11,
                      paddingVertical: 11,
                      borderBottomWidth: i === suggestions.length - 1 ? 0 : 0.5,
                      borderBottomColor: theme.colors.border,
                    }}
                  >
                    {/* Same tint as the rest of this tab — every suggestion
                        here is this tab's kind. */}
                    <Leading fav={s} tint={tint} accent={accent} />
                    <FavouriteBody fav={s} accent={accent} />
                    <KeepButton
                      label={`Save ${s.name} to favourites`}
                      onPress={() => save({ ...s, savedAt: new Date().toISOString() })}
                    />
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {tab === 'drink' ? (
            <>
              <AppText variant="cardTitle" style={{ fontSize: 15, marginTop: 16 }}>
                Add your own
              </AppText>
              <Card style={{ marginTop: 10, paddingVertical: 0 }}>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    openQuickLog('water');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Add your own drink"
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 11,
                    paddingVertical: 11,
                    opacity: pressed ? 0.68 : 1,
                  })}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: DRINK_TINT, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="add" size={19} color={theme.colors.water} stroke={2.4} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="cardTitle" style={{ fontSize: 14 }}>
                      Name it, set the volume
                    </AppText>
                    <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 2 }}>
                      Anything the examples do not cover
                    </AppText>
                  </View>
                  <Icon name="chevron-forward" size={17} color={theme.colors.textTertiary} stroke={2.2} />
                </Pressable>
              </Card>
            </>
          ) : null}

          <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 14, lineHeight: 15 }}>
            {tab === 'food'
              ? 'A favourite logs the portion you saved — not a category. Use Edit to remove one.'
              : 'A saved drink also appears in Quick add on the Water screen, so the favourite and the shortcut are the same thing.'}
          </AppText>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/** The vessel drawing for a drink; a tinted tile for food. */
function Leading({ fav, tint, accent }: { fav: Favourite; tint: string; accent: string }) {
  if (fav.kind === 'drink') {
    return (
      <View style={{ width: 40, alignItems: 'center', justifyContent: 'center' }}>
        <VesselIcon vessel={vesselForOunces(fav.ounces)} water={accent} width={30} height={36} />
      </View>
    );
  }
  return (
    <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="restaurant" size={18} color={accent} stroke={2.2} />
    </View>
  );
}

function FavouriteBody({ fav, accent }: { fav: Favourite; accent: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <AppText variant="cardTitle" style={{ fontSize: 14 }} numberOfLines={1}>
        {fav.name}
      </AppText>
      {fav.portion ? (
        <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 2 }}>
          {fav.portion}
        </AppText>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 5 }}>
        {fav.protein != null ? (
          <AppText variant="caption" style={{ fontSize: 10.5, fontWeight: '700', color: theme.colors.protein }}>
            {fav.protein} g protein
          </AppText>
        ) : null}
        {fav.ounces != null ? (
          <AppText variant="caption" style={{ fontSize: 10.5, fontWeight: '700', color: accent }}>
            {fav.ounces} oz
          </AppText>
        ) : null}
        {fav.calories != null ? (
          <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5 }}>
            {fav.calories} cal
          </AppText>
        ) : null}
        {/* A recipe favourite logs several foods at once — worth knowing
            before you tap Log. */}
        {fav.source === 'recipe' ? (
          <View style={{ paddingVertical: 2, paddingHorizontal: 6, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surfaceAlt }}>
            <AppText variant="caption" color="textTertiary" style={{ fontSize: 8.5, fontWeight: '800' }}>
              RECIPE
            </AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function KeepButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 32,
        height: 32,
        borderRadius: 11,
        borderWidth: 1.2,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {/* A star, not a plus: this says "I like this", which is what a
          favourite is. A plus would read as "add one more of these". */}
      <Icon name="star" size={16} color={theme.colors.warning} stroke={2.3} />
    </Pressable>
  );
}
