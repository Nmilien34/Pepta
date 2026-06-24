import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Card, SectionErrorBanner } from '../../components';
import { Icon } from '../../components/Icon';
import { useLogSheets } from '../../context/LogSheetsContext';
import { usePeptaData } from '../../context/PeptaDataContext';
import { useTheme } from '../../theme';
import { formatShortDate } from './progressView';

export function FoodHistoryScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { openMeal } = useLogSheets();
  const { track, trackLoading, trackError, refreshTrack } = usePeptaData();

  useEffect(() => {
    if (!track) void refreshTrack();
  }, [track, refreshTrack]);

  const meals = useMemo(
    () =>
      [...(track?.mealLogs ?? [])]
        .filter((meal) => meal.deletedAt == null)
        .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime()),
    [track?.mealLogs],
  );
  const totals = meals.reduce(
    (acc, meal) => ({
      protein: acc.protein + meal.protein,
      calories: acc.calories + meal.calories,
      fiber: acc.fiber + (meal.fiber ?? 0),
    }),
    { protein: 0, calories: 0, fiber: 0 },
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
          <DetailHeader title="Food History" onBack={() => navigation.goBack()} />
          <SectionErrorBanner errors={track?.sectionErrors ?? {}} style={{ marginTop: theme.spacing.md }} />

          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              openMeal();
            }}
            style={({ pressed }) => ({
              marginTop: theme.spacing.lg,
              borderRadius: 22,
              backgroundColor: theme.colors.surfaceAlt,
              paddingVertical: 14,
              paddingHorizontal: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              opacity: pressed ? 0.68 : 1,
            })}
          >
            <Icon name="search" size={18} color={theme.colors.textSecondary} />
            <AppText variant="body" color="textSecondary" style={{ flex: 1 }}>
              Search or add food...
            </AppText>
            <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.pill, paddingVertical: 6, paddingHorizontal: 10 }}>
              <AppText variant="caption" color="primary" style={{ fontWeight: '800' }}>
                Quick add
              </AppText>
            </View>
          </Pressable>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <QuickAction icon="camera" label="Meal Scan" onPress={openMeal} />
            <QuickAction icon="mic" label="Voice Log" onPress={openMeal} />
            <QuickAction icon="add" label="Quick Add" onPress={openMeal} />
          </View>

          {trackLoading && !track ? (
            <View style={{ paddingTop: 80, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors.protein} />
            </View>
          ) : trackError && !track ? (
            <Card style={{ marginTop: theme.spacing.lg }}>
              <AppText variant="bodyStrong" style={{ fontWeight: '800' }}>
                Couldn’t load food history
              </AppText>
              <AppText variant="caption" color="textSecondary" style={{ marginTop: 6 }}>
                {trackError}
              </AppText>
            </Card>
          ) : (
            <>
              <Card style={{ marginTop: 14, backgroundColor: '#FFF7EE' }} flat>
                <AppText variant="caption" color="textSecondary" style={{ fontWeight: '800', textTransform: 'uppercase' }}>
                  Logged meals
                </AppText>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                  <MiniTotal label="Protein" value={`${Math.round(totals.protein)}g`} />
                  <MiniTotal label="Calories" value={`${Math.round(totals.calories)}`} />
                  <MiniTotal label="Fiber" value={`${Math.round(totals.fiber)}g`} />
                </View>
              </Card>

              <Card style={{ marginTop: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon name="restaurant" size={18} color={theme.colors.protein} />
                    <AppText variant="cardTitle" style={{ fontSize: 16 }}>
                      Recent foods
                    </AppText>
                  </View>
                  <AppText variant="caption" color="textSecondary" style={{ fontWeight: '700' }}>
                    {meals.length}
                  </AppText>
                </View>

                {meals.length > 0 ? (
                  meals.slice(0, 20).map((meal, i) => (
                    <View
                      key={meal.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 11,
                        paddingVertical: 12,
                        borderTopWidth: i === 0 ? 0 : 0.5,
                        borderTopColor: theme.colors.border,
                      }}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 15, backgroundColor: '#FFF1E2', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name={meal.source === 'voice' ? 'mic' : meal.source === 'scan' ? 'camera' : 'restaurant'} size={18} color={theme.colors.protein} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppText variant="bodyStrong" style={{ fontWeight: '800' }} numberOfLines={1}>
                          {meal.foodName}
                        </AppText>
                        <AppText variant="caption" color="textSecondary" style={{ marginTop: 3 }}>
                          {formatShortDate(meal.datetime)}
                          {meal.servingSize ? ` · ${meal.servingSize}` : ''}
                        </AppText>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <AppText variant="bodyStrong" style={{ fontWeight: '800' }}>
                          {Math.round(meal.protein)}g
                        </AppText>
                        <AppText variant="caption" color="textTertiary">
                          {Math.round(meal.calories)} kcal
                        </AppText>
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={{ alignItems: 'center', paddingVertical: 42 }}>
                    <View style={{ width: 62, height: 62, borderRadius: 26, backgroundColor: '#FFF1E2', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="restaurant" size={28} color={theme.colors.protein} />
                    </View>
                    <AppText variant="cardTitle" align="center" style={{ marginTop: 14 }}>
                      Build your food history
                    </AppText>
                    <AppText variant="body" color="textSecondary" align="center" style={{ marginTop: 6, maxWidth: 270 }}>
                      Recently logged meals will appear here. Add one scan, voice note, or manual entry to start.
                    </AppText>
                  </View>
                )}
              </Card>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function DetailHeader({ title, onBack }: { title: string; onBack(): void }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => undefined);
          onBack();
        }}
        hitSlop={10}
        style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="chevron-back" size={25} color={theme.colors.textSecondary} stroke={2.4} />
      </Pressable>
      <AppText variant="screenTitle" style={{ fontSize: 24 }}>
        {title}
      </AppText>
      <View style={{ width: 38 }} />
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress(): void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        gap: 7,
        paddingVertical: 13,
        borderRadius: 18,
        backgroundColor: theme.colors.surface,
        borderWidth: 0.5,
        borderColor: theme.colors.border,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Icon name={icon} size={24} color={theme.colors.textPrimary} />
      <AppText variant="caption" style={{ fontWeight: '800' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function MiniTotal({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <AppText variant="statMedium" style={{ fontSize: 22 }}>
        {value}
      </AppText>
      <AppText variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
        {label}
      </AppText>
    </View>
  );
}
