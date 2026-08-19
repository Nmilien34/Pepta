// Item detail — tap any food, drink or favourite (design-lab frames
// "Item detail · top / scrolled / a drink").
//
// THE STEPPER SITS ABOVE EVERY NUMBER. The macros, the projection and the
// button all describe the amount about to be logged, so nobody converts a
// fixed 100 g in their head. Every figure below comes from scaleItem — none is
// a stored per-item value.
//
// THE HEADER COLLAPSES, IT DOES NOT COLLIDE. The big title fades out as it
// scrolls and the same name fades into a real nav bar, which sits inside the
// safe area rather than sliding under the clock.
//
// ONE OPINION, LABELLED. Every number here is a lookup with its source named
// underneath; Pep's note is the only judgement on the screen and it says so.

import React, { useMemo, useRef, useState } from 'react';
import { Animated, Image, Pressable, View } from 'react-native';
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { AppText, Button, Card } from '../../components';
import { Icon } from '../../components/Icon';
import { usePeptaData } from '../../context/PeptaDataContext';
import { useLogSheets } from '../../context/LogSheetsContext';
import { useTheme } from '../../theme';
import { todayStat } from './homeView';
import { useFavourites } from './useFavourites';
import { favouriteId, isSaved } from './favourites';
import {
  logButtonLabel,
  scaleItem,
  servingsLabel,
  stepServings,
  todayProjection,
  type DetailItem,
} from './itemDetail';

export type ItemDetailParams = { item: DetailItem };

/** The photo's height, and where the title hands over to the nav bar. */
const HERO_HEIGHT = 212;
/** The sheet rides up over the photo by this much, per the frame. */
const SHEET_OVERLAP = 26;
const COLLAPSE_AT = HERO_HEIGHT - 80;

export function ItemDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const route = useRoute<RouteProp<Record<string, ItemDetailParams>, string>>();
  const item = route.params?.item;
  const { home, bumpWater, addMeal, saveLog, refreshHome, refreshTrack } = usePeptaData();
  const { openMeal } = useLogSheets();
  const { favourites, save, unsave } = useFavourites();

  const [servings, setServings] = useState(1);
  const [logging, setLogging] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  const scaled = useMemo(() => (item ? scaleItem(item, servings) : null), [item, servings]);

  if (!item || !scaled) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <AppText variant="caption" color="textSecondary">Nothing to show.</AppText>
      </View>
    );
  }

  const isDrink = item.kind === 'drink';
  const accent = isDrink ? theme.colors.water : item.protein != null ? theme.colors.protein : theme.colors.fiber;

  // Which of today's numbers this moves. A drink moves water; a food moves the
  // macro it actually carries.
  const key = isDrink ? 'water' : item.protein != null ? 'protein' : 'fiber';
  const stat = home ? todayStat(home, key) : null;
  const adding = (isDrink ? scaled.ounces : key === 'protein' ? scaled.protein : scaled.fiber) ?? 0;
  const unit = isDrink ? 'oz' : 'g';
  const projection = todayProjection(stat?.current ?? 0, stat?.target ?? null, adding, unit);

  const favId = favouriteId(item.kind, item.name, item.servingLabel);
  const starred = isSaved(favourites, favId);

  const toggleStar = () => {
    Haptics.selectionAsync().catch(() => undefined);
    if (starred) {
      unsave(favId);
      return;
    }
    save({
      id: favId,
      kind: item.kind,
      name: item.name,
      portion: item.servingLabel,
      calories: item.calories,
      protein: item.protein,
      fiber: item.fiber,
      ounces: item.ounces,
      savedAt: new Date().toISOString(),
    });
  };

  const logIt = () => {
    if (logging) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    if (isDrink) {
      if (scaled.ounces != null) bumpWater(scaled.ounces);
      navigation.goBack();
      return;
    }
    // The same entry a meal log writes — optimistic now, durable behind it.
    const input = {
      foodName: item.name,
      servingSize: servingsLabel(servings, item.servingNoun),
      protein: scaled.protein ?? 0,
      calories: scaled.calories ?? 0,
      ...(scaled.carbs != null ? { carbs: scaled.carbs } : {}),
      ...(scaled.fat != null ? { fat: scaled.fat } : {}),
      ...(scaled.fiber != null ? { fiber: scaled.fiber } : {}),
      source: 'manual' as const,
      datetime: new Date().toISOString(),
    };
    setLogging(true);
    addMeal(input);
    saveLog('meal', input)
      .then((result) => {
        if (result !== 'saved') return;
        void refreshHome();
        void refreshTrack();
      })
      .catch(() => undefined)
      .finally(() => setLogging(false));
    navigation.goBack();
  };

  const navTitleOpacity = scrollY.interpolate({
    inputRange: [COLLAPSE_AT - 20, COLLAPSE_AT],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const heroOpacity = scrollY.interpolate({
    inputRange: [0, COLLAPSE_AT],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Animated.ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
      >
        {/* The hero. CONTAINED, never cropped — these are packshots, and a
            cropped bottle is a bottle you cannot recognise. */}
        <View style={{ height: HERO_HEIGHT, backgroundColor: theme.colors.bg }}>
          {item.photo ? (
            <Image source={item.photo} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
          ) : null}
          {/* Fades the photo into the sheet rather than cutting it off. */}
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 70, backgroundColor: theme.colors.bg, opacity: 0.001 }}
          />
        </View>

        {/* The sheet rides up over the photo. */}
        <View
          style={{
            backgroundColor: theme.colors.bg,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            marginTop: -SHEET_OVERLAP,
            paddingTop: 10,
            paddingHorizontal: 20,
            paddingBottom: 8,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 38,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.colors.border,
              marginBottom: 10,
            }}
          />
          <Animated.View style={{ opacity: heroOpacity }}>
            <AppText variant="screenTitle" style={{ fontSize: 24, lineHeight: 28 }}>{item.name}</AppText>
            {item.subtitle ? (
              <AppText variant="caption" color="textTertiary" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 16 }}>
                {item.subtitle} · {item.servingLabel} per {item.servingNoun}
              </AppText>
            ) : (
              <AppText variant="caption" color="textTertiary" style={{ fontSize: 11.5, marginTop: 4 }}>
                {item.servingLabel} per {item.servingNoun}
              </AppText>
            )}
          </Animated.View>

          {/* How much — the stepper every other number depends on. */}
          <Card style={{ marginTop: 14 }}>
            <SectionLabel>How much</SectionLabel>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <AppText variant="caption" color="textSecondary" style={{ flex: 1, fontSize: 12 }}>
                {item.servingLabel}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <StepButton icon="remove" label="One fewer" accent={accent} onPress={() => setServings((s) => stepServings(s, -1))} />
                <AppText variant="cardTitle" style={{ fontSize: 14, minWidth: 78, textAlign: 'center' }}>
                  {servingsLabel(servings, item.servingNoun)}
                </AppText>
                <StepButton icon="add" label="One more" accent={accent} onPress={() => setServings((s) => stepServings(s, 1))} />
              </View>
            </View>
          </Card>

          {/* What this adds — the headline pair, then the rest. */}
          <Card style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <SectionLabel>What this adds</SectionLabel>
              <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5 }}>
                per {servingsLabel(servings, item.servingNoun)}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 18, marginTop: 10 }}>
              <Headline
                value={isDrink ? scaled.ounces : key === 'protein' ? scaled.protein : scaled.fiber}
                unit={isDrink ? 'oz' : 'g'}
                caption={isDrink ? 'toward your water' : key === 'protein' ? 'protein' : 'fiber'}
                accent={accent}
              />
              {scaled.calories != null ? (
                <Headline value={scaled.calories} caption="calories" accent={theme.colors.textPrimary} />
              ) : null}
            </View>
            <Micros scaled={scaled} isDrink={isDrink} />
          </Card>

          {/* What it does to today — two segments, so the user can see which
              part is already theirs and which part is the decision. */}
          <Card style={{ marginTop: 12 }}>
            <SectionLabel>What it does to today</SectionLabel>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 10 }}>
              <AppText variant="caption" color="textSecondary" style={{ fontSize: 12, fontWeight: '700' }}>
                {isDrink ? 'Water' : key === 'protein' ? 'Protein' : 'Fiber'}
              </AppText>
              <AppText variant="caption" color="textTertiary" style={{ fontSize: 12 }}>
                {projection.from} →
              </AppText>
              <AppText variant="cardTitle" style={{ fontSize: 17, color: accent }}>
                {projection.to}
              </AppText>
              <AppText variant="caption" color="textTertiary" style={{ fontSize: 12 }}>
                {projection.target != null ? `of ${projection.target} ${unit}` : unit}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', height: 7, borderRadius: 4, overflow: 'hidden', backgroundColor: theme.colors.surfaceAlt, marginTop: 10 }}>
              <View style={{ flex: projection.loggedPct, backgroundColor: accent }} />
              <View style={{ flex: projection.addedPct, backgroundColor: accent, opacity: 0.45 }} />
              <View style={{ flex: Math.max(0, 1 - projection.loggedPct - projection.addedPct) }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 14, marginTop: 8 }}>
              <Key colour={accent} label="logged" />
              <Key colour={accent} label="this" faded />
            </View>
            <AppText variant="caption" color="textTertiary" style={{ fontSize: 11, marginTop: 8 }}>
              {projection.remainderLine}
            </AppText>
          </Card>

          {/* Nutrition — the full panel, at the amount selected. */}
          <NutritionCard item={item} scaled={scaled} servings={servings} />

          <Card style={{ marginTop: 12, paddingVertical: 0 }}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                navigation.goBack();
                openMeal(
                  {
                    foodName: item.name,
                    servingSize: servingsLabel(servings, item.servingNoun),
                    protein: scaled.protein,
                    calories: scaled.calories,
                    fiber: scaled.fiber,
                  },
                  { keepAsRecipe: true },
                );
              }}
              accessibilityRole="button"
              accessibilityLabel="Add to a recipe"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 13,
                opacity: pressed ? 0.68 : 1,
              })}
            >
              <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="restaurant" size={18} color={theme.colors.primary} stroke={2.2} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="cardTitle" style={{ fontSize: 14 }}>Add to a recipe</AppText>
                <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 1 }}>
                  Use it as an ingredient instead of logging it now
                </AppText>
              </View>
              <Icon name="chevron-forward" size={17} color={theme.colors.textTertiary} stroke={2.2} />
            </Pressable>
          </Card>

          {item.note ? (
            <Card style={{ marginTop: 12, backgroundColor: theme.colors.surfaceAlt }}>
              <AppText variant="caption" color="textTertiary" style={{ fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 }}>
                PEP’S NOTE
              </AppText>
              <AppText variant="caption" color="textSecondary" style={{ fontSize: 12, marginTop: 6, lineHeight: 18 }}>
                {item.note}
              </AppText>
            </Card>
          ) : null}

          {/* Only when there is one. A screen that cites nothing is honest; one
              that cites something unverifiable is not. */}
          {item.source ? (
            <AppText variant="caption" color="textTertiary" style={{ fontSize: 10, marginTop: 14, lineHeight: 14 }}>
              Source: {item.source}
            </AppText>
          ) : null}
        </View>
      </Animated.ScrollView>

      {/* A nav bar that fades in as the photo scrolls away, so the title never
          slides under the clock. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          paddingTop: insets.top,
          paddingBottom: 10,
          backgroundColor: theme.colors.bg,
          borderBottomWidth: 0.5,
          borderBottomColor: theme.colors.border,
          opacity: navTitleOpacity,
        }}
      >
        <AppText variant="cardTitle" style={{ fontSize: 16, textAlign: 'center', paddingHorizontal: 64 }} numberOfLines={1}>
          {item.name}
        </AppText>
      </Animated.View>

      {/* The two circles ride above both, so back and star are reachable at
          every scroll position. */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + 12,
          left: 14,
          right: 14,
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <FloatingButton label="Back" onPress={() => navigation.goBack()}>
          <Icon name="chevron-back" size={19} color={theme.colors.textPrimary} stroke={2.4} />
        </FloatingButton>
        <FloatingButton
          label={starred ? `Remove ${item.name} from favourites` : `Save ${item.name} to favourites`}
          onPress={toggleStar}
        >
          <Icon name="star" size={18} color={starred ? theme.colors.warning : theme.colors.textTertiary} stroke={2.2} />
        </FloatingButton>
      </View>

        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: insets.bottom > 0 ? insets.bottom : 14,
            borderTopWidth: 0.5,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.bg,
          }}
        >
          <Button label={logButtonLabel(item, servings)} onPress={logIt} disabled={logging} />
        </View>
    </View>
  );
}

/** A control that sits on the photo: white disc, soft shadow, always reachable. */
function FloatingButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: 'rgba(255,255,255,0.92)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#1E1812',
        shadowOpacity: 0.16,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <AppText variant="cardTitle" style={{ fontSize: 13 }}>
      {children}
    </AppText>
  );
}

function Headline({
  value,
  unit,
  caption,
  accent,
}: {
  value: number | undefined;
  unit?: string;
  caption: string;
  accent: string;
}) {
  if (value == null) return null;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <AppText variant="statBig" style={{ color: accent }}>{value}</AppText>
        {unit ? (
          <AppText variant="caption" color="textTertiary" style={{ fontSize: 12 }}>{unit}</AppText>
        ) : null}
      </View>
      <AppText variant="caption" color="textTertiary" style={{ fontSize: 11, marginTop: 2 }}>
        {caption}
      </AppText>
    </View>
  );
}

/** The secondary figures. A food shows macros; a drink shows electrolytes. */
function Micros({ scaled, isDrink }: { scaled: ReturnType<typeof scaleItem>; isDrink: boolean }) {
  const rows: [string, string][] = [];
  const add = (label: string, value: number | undefined, unit: string) => {
    if (value != null) rows.push([label, `${value} ${unit}`]);
  };
  if (isDrink) {
    add('SODIUM', scaled.sodium, 'mg');
    add('POTASSIUM', scaled.potassium, 'mg');
    add('MAGNESIUM', scaled.magnesium, 'mg');
  } else {
    add('CARBS', scaled.carbs, 'g');
    add('FAT', scaled.fat, 'g');
    add('FIBER', scaled.fiber, 'g');
    add('SODIUM', scaled.sodium, 'mg');
  }
  if (rows.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 14 }}>
      {rows.map(([label, value]) => (
        <View key={label}>
          <AppText variant="caption" color="textTertiary" style={{ fontSize: 9, fontWeight: '800', letterSpacing: 0.4 }}>
            {label}
          </AppText>
          <AppText variant="caption" style={{ fontSize: 12.5, fontWeight: '700', marginTop: 2 }}>
            {value}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function NutritionCard({
  item,
  scaled,
  servings,
}: {
  item: DetailItem;
  scaled: ReturnType<typeof scaleItem>;
  servings: number;
}) {
  const theme = useTheme();
  const rows: [string, string][] = [];
  const add = (label: string, value: number | undefined, unit: string) => {
    if (value != null) rows.push([label, `${value}${unit}`]);
  };
  add('Calories', scaled.calories, '');
  add('Protein', scaled.protein, ' g');
  add('Carbohydrate', scaled.carbs, ' g');
  add('Fat', scaled.fat, ' g');
  add('Saturated fat', scaled.satFat, ' g');
  add('Fiber', scaled.fiber, ' g');
  add('Sodium', scaled.sodium, ' mg');
  add('Potassium', scaled.potassium, ' mg');
  add('Magnesium', scaled.magnesium, ' mg');
  if (rows.length === 0) return null;

  return (
    <Card style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionLabel>Nutrition</SectionLabel>
        <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5 }}>
          per {servingsLabel(servings, item.servingNoun)}
        </AppText>
      </View>
      <View style={{ marginTop: 6 }}>
        {rows.map(([label, value], i) => (
          <View
            key={label}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: 8,
              borderBottomWidth: i === rows.length - 1 ? 0 : 0.5,
              borderBottomColor: theme.colors.border,
            }}
          >
            <AppText variant="caption" color="textSecondary" style={{ fontSize: 12.5 }}>{label}</AppText>
            <AppText variant="caption" style={{ fontSize: 12.5, fontWeight: '700' }}>{value}</AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}

function Key({ colour, label, faded }: { colour: string; label: string; faded?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colour, opacity: faded ? 0.45 : 1 }} />
      <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5 }}>{label}</AppText>
    </View>
  );
}

function StepButton({
  icon,
  label,
  accent,
  onPress,
}: {
  icon: string;
  label: string;
  accent: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: theme.colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon name={icon} size={16} color={accent} stroke={2.6} />
    </Pressable>
  );
}
