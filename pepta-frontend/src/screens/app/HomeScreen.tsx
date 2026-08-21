// Home tab — the tracker dashboard. Wired to PeptaDataContext (GET /home): first
// load → loading, failure → error (retry), success → the cards. Pull-to-refresh,
// staggered entrance, ring fills + count-ups, optimistic+persisted inline steppers.
//
// Surfaces everything HomeResponse provides: medication level + next dose, today's
// calories / protein / fiber / water vs. their profile targets, logging streak,
// setup progress, latest weight, and the first insight.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Switch, View } from 'react-native';
import { Icon } from "../../components/Icon";
import * as Haptics from 'expo-haptics';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { HomeRangeKey } from '@pepta/shared';
import { useTheme } from '../../theme';
import { AppText, Button, Card, CountUp, GlassEdge, CardIcon, DataHealthCardView, LogDoseCta, Mascot, ProgressBar, ProgressRing, Reveal, SectionErrorBanner, WaterCup } from '../../components';
import { useCompanionName } from '../../components/useCompanionName';
import { LivingMascot } from '../../components/LivingMascot';
import { useSeenTeachCards } from './useSeenTeachCards';
import { usePeptaData } from '../../context/PeptaDataContext';
import { useLogSheets } from '../../context/LogSheetsContext';
import { buildHomeView, recentDayLetters, type GoalView, type HomeWeightPulseView, type LevelBar, type RingStat } from './homeView';
import { globalDoseNoun, LEVEL_SUPPRESSION_COPY } from './levelSuppression';
import { buildActivity, buildTodaysLog, type ActivitySummary, type LogChip, type LogKind } from './homeExtras';
import { HomeShortcuts, type Shortcut } from './HomeShortcuts';
import { SHORTCUT_PHOTOS } from './nutrientPhotos';
import { buildGettingStarted, buildPlanSummary, type GettingStarted, type LogAction, type PlanSummary } from './planView';
import { resolveTeachCard, type PepTeachCard, type ResolvedTeachCard } from './pepTeach';
import { doseCtaState } from './doseCta';
import { doseCtaExpanded } from './doseCtaFold';
import { useDoseCtaFold } from './useDoseCtaFold';
import { localDateOnly } from '../../utils/cycleWindows';

const HOME_RANGES: { key: HomeRangeKey; label: string; short: string }[] = [
  { key: 'today', label: 'Today', short: 'Day' },
  { key: 'week', label: 'Weekly', short: 'Week' },
  { key: 'month', label: 'Monthly', short: 'Month' },
  { key: 'year', label: 'Yearly', short: 'Year' },
];

// "Updated 8:41 PM" / "Updated Jul 27" — the honest one-liner for how fresh
// the dashboard is. Between cache hydration and the background refresh landing
// (or through a whole offline session) the user is reading a snapshot; this is
// what tells them so.
function formatSyncTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return 'recently';
  const now = new Date();
  const sameDay =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate();
  if (sameDay) {
    return at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function HomeScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const { home, track, homeLoading, homeError, homeRefreshing, homeRange, refreshHome, refreshTrack, schedules, cycles, refreshScheduling, bumpProtein, bumpWater, bumpFiber, pendingLogs, lastSyncedAt, saveLog, deleteLog } = usePeptaData();
  const { openQuickLog, openMeal } = useLogSheets();
  /**
   * Today's resistance log id. A ref because the handler is declared above the
   * early returns — where hooks must live — and `activity` is built below
   * them; the ref is read at tap time, by which point it is set.
   */
  const resistanceLogRef = useRef<string | null>(null);

  /**
   * Turning the row on writes an activity log for today; turning it off
   * removes the one that carried it. Logs are create-and-soft-delete — there
   * is no edit — so "off" has to mean the record goes, not that a second log
   * says the opposite.
   */
  const setResistanceToday = (next: boolean) => {
    if (next) {
      void saveLog('activity', { resistanceTraining: true, datetime: new Date().toISOString() });
      return;
    }
    const id = resistanceLogRef.current;
    if (id) void deleteLog('activity', id);
  };
  // When "Log a shot" is on the level card, and whether it beats. Dose LOGS,
  // not medicationLevels — the level list excludes unmodelled and oral
  // compounds, so reading it here would leave those users pulsing forever no
  // matter how much they logged (same trap as the 2026-08-11 audit's
  // getting-started task).
  const doseCta = doseCtaState({
    schedules,
    cycles,
    doseLogs: track?.doseLogs ?? null,
    today: new Date(),
  });
  const [rangeOpen, setRangeOpen] = useState(false);

  const onTask = (action: LogAction | null) => {
    if (action === 'meal') openMeal();
    else if (action === 'water') openQuickLog('water');
    else if (action === 'weight') openQuickLog('weight');
    else if (action === 'dose') openQuickLog('dose');
  };

  useEffect(() => {
    if (!home) void refreshHome();
    if (!track) void refreshTrack();
    // Home needs the schedule now too: it is what says whether a dose is due
    // today, and therefore whether the log button belongs on the level card.
    if (!schedules) void refreshScheduling();
  }, [home, track, schedules, refreshHome, refreshTrack, refreshScheduling]);

  // EVERY hook lives above the early returns. The crash this guards against:
  // while `home` was null this component returned early, so the render where
  // data arrived called MORE hooks than the render before it — a rules-of-hooks
  // violation that React turns into a throw, which the root boundary showed as
  // "Something went wrong" the moment anyone entered the app. It shipped that
  // way in builds 20–22 because the react-hooks lint plugin was silently
  // broken. Do not move hooks back below the guards.
  const companionName = useCompanionName();
  const { seen, markSeen, fold, setFold } = useSeenTeachCards();
  // ALL hooks stay above the early returns — see the note above.
  const { fold: doseFold, closeFor: closeDoseCta, reopen: reopenDoseCta } = useDoseCtaFold();
  // One lesson a day at most, about the user's own compounds, and only when
  // the day-one checklist is done — a new user has enough to read already.
  // A card folded today stays that card: resolveTeachCard does not re-pick
  // while a fold is live, which is what stops "Not now" from behaving like
  // "next please".
  const teach = useMemo<ResolvedTeachCard>(() => {
    if (!home) return { card: null, collapsed: false };
    if (buildGettingStarted(home, track).show) return { card: null, collapsed: false };
    return resolveTeachCard({
      compoundNames: home.activeCompounds.map((c) => c.name),
      seenEntryIds: seen,
      dayIndex: Math.floor(Date.now() / 86_400_000),
      fold,
      today: localDateOnly(new Date()),
    });
  }, [home, seen, fold]);

  if (!home && homeError) {
    return (
      <CenteredState>
        <Mascot pose="idle" size={120} />
        <AppText variant="cardTitle" align="center" style={{ marginTop: theme.spacing.lg }}>
          Something went wrong
        </AppText>
        <AppText variant="body" color="textSecondary" align="center" style={{ marginTop: theme.spacing.sm, maxWidth: 280 }}>
          {homeError}
        </AppText>
        <View style={{ marginTop: theme.spacing.xl, width: 200 }}>
          <Button label="Try again" onPress={refreshHome} loading={homeLoading} />
        </View>
      </CenteredState>
    );
  }

  if (!home) {
    return (
      <CenteredState>
        <Mascot pose="idle" size={110} />
        <ActivityIndicator color={theme.colors.primary} style={{ marginTop: theme.spacing.lg }} />
      </CenteredState>
    );
  }

  const todayOnly = localDateOnly(new Date());
  // The section opens itself on dose days unless closed earlier today.
  const doseCtaOpen = doseCtaExpanded(doseCta.show, doseFold, todayOnly);
  const view = buildHomeView(home);
  const plan = buildPlanSummary(home);
  const gettingStarted = buildGettingStarted(home, track);
  const selectedRange = home.selectedRange ?? homeRange;
  const rangeAvailability = home.rangeAvailability ?? { today: true, week: false, month: false, year: false };
  const activity = buildActivity(track, home.profile, new Date(), selectedRange, home.rangeTotals);
  resistanceLogRef.current = activity.resistanceLogId;
  const todaysLog = buildTodaysLog(track, home, new Date(), selectedRange);
  // All four designed tiles, two rows of two. Recipes was held back while its
  // screen was designed-but-unbuilt — a tile that goes nowhere is worse than a
  // missing one — and that stopped being true when RecipesScreen shipped. It is
  // routed at MainTabs and already reached from Account and NutrientWays, so
  // Home was the only surface still pretending it did not exist.
  const shortcuts: Shortcut[] = [
    { key: 'meals', label: 'Meals', photo: SHORTCUT_PHOTOS.meals, onPress: openMeal },
    {
      key: 'fiber',
      label: 'Fiber',
      photo: SHORTCUT_PHOTOS.fiber,
      onPress: () => navigation.navigate('NutrientWays', { kind: 'fiber' }),
    },
    {
      key: 'hydration',
      label: 'Hydration',
      photo: SHORTCUT_PHOTOS.hydration,
      onPress: () => navigation.navigate('Water'),
    },
    {
      key: 'recipes',
      label: 'Recipes',
      photo: SHORTCUT_PHOTOS.recipes,
      onPress: () => navigation.navigate('Recipes'),
    },
  ];

  const selectRange = (range: HomeRangeKey) => {
    if (!rangeAvailability[range]) return;
    Haptics.selectionAsync().catch(() => undefined);
    setRangeOpen(false);
    void refreshHome(range);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={homeRefreshing} onRefresh={refreshHome} tintColor={theme.colors.primary} />
          }
        >
          {rangeOpen ? (
            <Pressable
              onPress={() => setRangeOpen(false)}
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                minHeight: 1200,
                zIndex: 10,
              }}
            />
          ) : null}
          {/* header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, zIndex: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              {/* Flush to the ground — no disc, no ring. Pep is the logo here,
                  and a tinted circle behind him made the wordmark read as an
                  app icon pasted onto the screen. The lavender was a leftover
                  from the cool palette too: it never moved to the warm ground. */}
              <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Mascot pose="idle" size={40} />
              </View>
              <View>
                <AppText variant="screenTitle" style={{ fontSize: 21 }}>
                  Pepta
                </AppText>
                {pendingLogs > 0 ? (
                  <AppText variant="caption" style={{ fontSize: 10, fontWeight: '700', color: '#B58500' }}>
                    {/* NOT "when online": the app never checks connectivity.
                        A log queues on a 5xx, a 15s timeout, or a real network
                        drop alike, so naming the user's connection diagnoses a
                        cause we did not measure — usually ours. */}
                    {pendingLogs === 1 ? '1 log saved on this device — retrying' : `${pendingLogs} logs saved on this device — retrying`}
                  </AppText>
                ) : lastSyncedAt ? (
                  <AppText variant="caption" color="textTertiary" style={{ fontSize: 10 }}>
                    Updated {formatSyncTime(lastSyncedAt)}
                  </AppText>
                ) : null}
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <View style={{ position: 'relative' }}>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    setRangeOpen((open) => !open);
                  }}
                  style={[
                    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 11, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surface, borderWidth: 0.5, borderColor: theme.colors.border },
                    theme.shadows.card,
                  ]}
                >
                  <Icon name="calendar" size={14} color={theme.colors.textSecondary} stroke={2.1} />
                  <AppText variant="caption" style={{ fontWeight: '700', fontSize: 13 }}>
                    {HOME_RANGES.find((range) => range.key === selectedRange)?.label ?? view.rangeLabel}
                  </AppText>
                  <Icon name={rangeOpen ? 'chevron-up' : 'chevron-down'} size={13} color={theme.colors.textTertiary} stroke={2.2} />
                </Pressable>
                {rangeOpen ? (
                  <View
                    style={[
                      {
                        position: 'absolute',
                        top: 42,
                        right: 0,
                        width: 176,
                        borderRadius: 22,
                        backgroundColor: theme.colors.surface,
                        borderWidth: 0.5,
                        borderColor: 'rgba(17,17,26,0.08)',
                        padding: 6,
                        shadowColor: '#11111A',
                        shadowOpacity: 0.08,
                        shadowRadius: 18,
                        shadowOffset: { width: 0, height: 10 },
                        elevation: 5,
                      },
                    ]}
                  >
                    {HOME_RANGES.map((range) => {
                      const active = selectedRange === range.key;
                      const enabled = rangeAvailability[range.key] ?? range.key === 'today';
                      return (
                        <Pressable
                          key={range.key}
                          disabled={!enabled}
                          onPress={() => selectRange(range.key)}
                          style={({ pressed }) => ({
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingVertical: 10,
                            paddingHorizontal: 11,
                            borderRadius: 16,
                            backgroundColor: active ? '#EFEBFF' : 'transparent',
                            opacity: !enabled ? 0.38 : pressed ? 0.68 : 1,
                          })}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Icon
                              name={range.key === 'today' ? 'calendar' : range.key === 'week' ? 'calendar-week' : 'calendar-range'}
                              size={15}
                              color={active ? theme.colors.primary : enabled ? theme.colors.textSecondary : theme.colors.textTertiary}
                              stroke={2.1}
                            />
                            <AppText
                              variant="caption"
                              style={{
                                fontWeight: active ? '800' : '700',
                                color: active ? theme.colors.primary : enabled ? theme.colors.textPrimary : theme.colors.textTertiary,
                              }}
                            >
                              {range.label}
                            </AppText>
                          </View>
                          {active ? <Icon name="checkmark" size={14} color={theme.colors.primary} stroke={2.4} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
              {view.streakDays > 0 ? (
                <GlassEdge radius={theme.radii.pill} backgroundColor="#FFF1E8">
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10 }}>
                    <Icon name="fire" size={14} color={theme.colors.streak} />
                    <AppText variant="caption" style={{ fontWeight: '700', color: theme.colors.streak }}>
                      {view.streakDays}
                    </AppText>
                  </View>
                </GlassEdge>
              ) : null}
              <View style={{ width: 34, height: 34, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="sparkles" size={18} color={theme.colors.primary} />
              </View>
            </View>
          </View>

          <SectionErrorBanner errors={home.sectionErrors} style={{ marginTop: theme.spacing.md }} />

          {/* day-one: personalized plan + getting-started checklist */}
          {plan ? (
            <Reveal delay={40} style={{ marginTop: theme.spacing.lg }}>
              <PlanCard plan={plan} />
            </Reveal>
          ) : null}
          {gettingStarted.show ? (
            <Reveal delay={plan ? 90 : 60} style={{ marginTop: 12 }}>
              <GettingStartedCard data={gettingStarted} onTask={onTask} />
            </Reveal>
          ) : null}

          {/* Data health. Above the lesson because it is about the user's own
              records being wrong, not something new to read — and it renders
              nothing at all for the ~everyone whose data is fine. */}
          <DataHealthCardView />

          {/* Pep's daily lesson. Sits BELOW the day-one checklist and only
              appears once that checklist is gone, so a brand-new user is never
              handed reading material and a to-do list at the same time. */}
          {teach.card ? (
            <Reveal delay={90} style={{ marginTop: 12 }}>
              <TeachCard
                card={teach.card}
                companionName={companionName}
                collapsed={teach.collapsed}
                // The chevron folds and unfolds the SAME card: both directions
                // keep it pinned for today, so reopening what you folded gives
                // you back that lesson rather than a fresh one.
                onToggle={() =>
                  setFold({
                    entryId: teach.card!.entryId,
                    day: localDateOnly(new Date()),
                    collapsed: !teach.collapsed,
                  })
                }
                onRead={() => {
                  markSeen(teach.card!.entryId);
                  setFold(null);
                  navigation.navigate('LibraryEntry', { entryId: teach.card!.entryId });
                }}
                // "NOT NOW" MEANS NOT TODAY, NOT "NEXT ONE". It folds this card
                // and leaves it folded; the lesson is marked seen so tomorrow
                // brings a different one, but nothing is re-picked today —
                // which is what used to make one tap produce a fresh card to
                // decline all over again.
                onDismiss={() => {
                  markSeen(teach.card!.entryId);
                  setFold({
                    entryId: teach.card!.entryId,
                    day: localDateOnly(new Date()),
                    collapsed: true,
                  });
                }}
              />
            </Reveal>
          ) : null}

          {/* medication level */}
          <Reveal delay={60} style={{ marginTop: theme.spacing.lg }}>
            {view.medication ? (
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
                    <CardIcon name="needle" color={theme.colors.primary} />
                    <AppText variant="cardTitle" style={{ fontSize: 15 }} numberOfLines={1}>
                      Medication Level
                    </AppText>
                    <Icon name="information-circle-outline" size={14} color={theme.colors.textTertiary} />
                  </View>
                  {/* The pill is one line, always. flexShrink 0 + numberOfLines
                      keeps it a single row; the title truncates first. */}
                  <View style={{ backgroundColor: theme.colors.surfaceAlt, paddingVertical: 5, paddingHorizontal: 11, borderRadius: theme.radii.pill, flexShrink: 0 }}>
                    <AppText variant="caption" color="textSecondary" style={{ fontWeight: '600' }} numberOfLines={1}>
                      {view.medication.status}
                    </AppText>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: theme.spacing.md }}>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
                      <CountUp value={view.medication.estimate} format={(n) => n.toFixed(2)} variant="statBig" color="primary" />
                      <AppText variant="caption" color="textSecondary">
                        {view.medication.unit}
                      </AppText>
                    </View>
                    <AppText variant="caption" color="textTertiary" style={{ marginTop: 6 }}>
                      Current estimate
                    </AppText>
                  </View>
                  <LevelBars bars={view.medication.bars} />
                </View>
                {view.medication.countdown ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: theme.spacing.md, paddingTop: theme.spacing.sm, borderTopWidth: 0.5, borderTopColor: theme.colors.border }}>
                    <Icon name="time-outline" size={14} color={theme.colors.textSecondary} />
                    <AppText variant="caption" color="textSecondary">
                      Next {globalDoseNoun(home.activeCompounds)} in {view.medication.countdown}
                    </AppText>
                  </View>
                ) : null}
                {/* Only on the days a dose is actually wanted (doseCta.ts).
                    Once today's dose is logged the button goes and the card
                    collapses back to level + bars — a permanent CTA on a status
                    card reads as an unfinished task. No heartbeat here: the
                    pulse has done its job the moment a first dose exists, and a
                    long-time user must never have a twitching Home screen. */}
                {doseCta.show ? (
                  <DoseCtaSection
                    label={`Log a ${globalDoseNoun(home.activeCompounds)}`}
                    pulse={false}
                    expanded={doseCtaOpen}
                    onPress={() => openQuickLog('dose')}
                    onClose={() => closeDoseCta(todayOnly)}
                    onReopen={reopenDoseCta}
                  />
                ) : null}
              </Card>
            ) : (
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
                    <CardIcon name="needle" color={theme.colors.primary} />
                    <AppText variant="cardTitle" style={{ fontSize: 15 }} numberOfLines={1}>
                      Medication Level
                    </AppText>
                    <Icon name="information-circle-outline" size={14} color={theme.colors.textTertiary} />
                  </View>
                  {/* "No doses yet" is the longest label this pill ever carries
                      — the populated card only ever says Steady/Peaking/Low —
                      so it is the one that wrapped, dropping "yet" onto a second
                      line and making the pill two rows tall. */}
                  <View style={{ backgroundColor: theme.colors.surfaceAlt, paddingVertical: 5, paddingHorizontal: 11, borderRadius: theme.radii.pill, flexShrink: 0 }}>
                    <AppText variant="caption" color="textTertiary" style={{ fontWeight: '600' }} numberOfLines={1}>
                      {view.levelSuppressed ? 'Not tracked' : 'No doses yet'}
                    </AppText>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: theme.spacing.md }}>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
                      <AppText variant="statBig" color="textTertiary">
                        —
                      </AppText>
                      <AppText variant="caption" color="textTertiary">
                        mg
                      </AppText>
                    </View>
                    <AppText variant="caption" color="textTertiary" style={{ marginTop: 6 }}>
                      Current estimate
                    </AppText>
                  </View>
                  <LevelBars bars={null} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: theme.spacing.md, paddingTop: theme.spacing.sm, borderTopWidth: 0.5, borderTopColor: theme.colors.border }}>
                  <Icon name="time-outline" size={14} color={theme.colors.textSecondary} />
                  <AppText variant="caption" color="textSecondary">
                    {view.levelSuppressed
                      ? LEVEL_SUPPRESSION_COPY[view.levelSuppressed]
                      : `Log your first ${globalDoseNoun(home.activeCompounds)} to start tracking levels.`}
                  </AppText>
                </View>
                {/* The card states the problem; this is the fix. It beats only
                    while there is genuinely nothing logged. This branch also
                    covers oral/unmodelled users, who have no curve to collapse
                    to — same due-day rule applies. */}
                {doseCta.show ? (
                  <DoseCtaSection
                    label={`Log a ${globalDoseNoun(home.activeCompounds)}`}
                    pulse={doseCta.pulse}
                    expanded={doseCtaOpen}
                    onPress={() => openQuickLog('dose')}
                    onClose={() => closeDoseCta(todayOnly)}
                    onReopen={reopenDoseCta}
                  />
                ) : null}
              </Card>
            )}
          </Reveal>

          {/* macros + goal — column-stack grid (fiber/protein | water/goal) */}
          <Reveal delay={200} style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <View style={{ flex: 1, gap: 12 }}>
              <FiberCard stat={view.fiber} onMinus={() => bumpFiber(-1)} onPlus={() => bumpFiber(1)} onOpen={() => navigation.navigate('NutrientWays', { kind: 'fiber' })} />
              <MacroRingCard
                title="Protein"
                icon={<CardIcon name="food-drumstick" color={theme.colors.protein} />}
                stat={view.protein}
                unit="g"
                color={theme.colors.protein}
                stepper={<Stepper label="5 g" color={theme.colors.protein} onMinus={() => bumpProtein(-5)} onPlus={() => bumpProtein(5)} />}
                onExamples={() => navigation.navigate('NutrientWays', { kind: 'protein' })}
              />
            </View>
            <View style={{ flex: 1, gap: 12 }}>
              <WaterCard stat={view.water} onMinus={() => bumpWater(-8)} onPlus={() => bumpWater(8)} onOpen={() => navigation.navigate('Water')} />
              <MealsCard stat={view.calories} onLog={openMeal} />
            </View>
          </Reveal>

          {/* shortcuts — doors to the food surfaces, between the nutrient
              cards and the weight card (the order Nick landed on) */}
          <Reveal delay={225} style={{ marginTop: 12 }}>
            <HomeShortcuts shortcuts={shortcuts} />
          </Reveal>

          <Reveal delay={250} style={{ marginTop: 12 }}>
            <HomeWeightPulseCard pulse={view.weightPulse} goal={view.goal} onLog={() => openQuickLog('weight')} />
          </Reveal>

          {/* activity */}
          <Reveal delay={280} style={{ marginTop: 12 }}>
            <ActivityCard
              activity={activity}
              onLog={() => openQuickLog('activity')}
              onSetResistance={setResistanceToday}
            />
          </Reveal>

          {/* today's log */}
          <Reveal delay={340} style={{ marginTop: 12 }}>
            <TodaysLogCard chips={todaysLog} rangeLabel={view.rangeLabel} onSeeAll={() => navigation.navigate('FoodHistory')} />
          </Reveal>

          {/* insight */}
          {view.insight ? (
            <Reveal delay={460} style={{ marginTop: 12 }}>
              <Card style={{ flexDirection: 'row', gap: 12 }}>
                <Mascot pose="idle" size={40} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" style={{ fontWeight: '700' }}>
                    {view.insight.headline}
                  </AppText>
                  <AppText variant="caption" color="textSecondary" style={{ marginTop: 6 }}>
                    {view.insight.body}
                  </AppText>
                </View>
              </Card>
            </Reveal>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// Pep's 30-second lesson. Tinted like PlanCard so it reads as part of the app
// rather than an ad, and the citation is never optional — a card without a
// source is indistinguishable from a Reddit comment.
//
// COLLAPSIBLE, because it is the tallest thing on Home: title + body + citation
// + two buttons pushed the medication level below the fold on a real account.
// Collapsing keeps the header — who is talking and what about — so it reads as
// a folded lesson, not a stray line. It is a lighter action than "Not now",
// which dismisses the card for good.
function TeachCard({
  card,
  companionName,
  collapsed,
  onToggle,
  onRead,
  onDismiss,
}: {
  card: PepTeachCard;
  companionName: string;
  collapsed: boolean;
  onToggle(): void;
  onRead(): void;
  onDismiss(): void;
}) {
  const theme = useTheme();
  return (
    // Same material as the plan card: warm alt behind a glass rim. Pep's voice
    // no longer needs a purple wash to be recognisable — the mascot is right
    // there — and purple is now reserved for the gauges.
    <GlassEdge radius={theme.radii.card} backgroundColor={theme.colors.surfaceAlt}>
      <View style={{ padding: theme.spacing.lg }}>
      <View style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
        <LivingMascot pose="idle" size={50} bobSeconds={3.8} />
        <View style={{ flex: 1 }}>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              onToggle();
            }}
            accessibilityRole="button"
            accessibilityState={{ expanded: !collapsed }}
            accessibilityLabel={collapsed ? `Expand: ${card.title}` : `Collapse: ${card.title}`}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              {/* Grey, not purple, in both the folded and open states. The
                  colour pass reserved purple for the gauges; Pep is identified
                  by the mascot sitting next to the label, not by a tint. */}
              <AppText variant="caption" color="textSecondary" style={{ fontWeight: '700', flexShrink: 1 }}>
                {companionName} · 30 seconds?
              </AppText>
              <Icon
                name={collapsed ? 'chevron-down' : 'chevron-up'}
                size={16}
                color={theme.colors.textTertiary}
              />
            </View>
            {/* The title survives collapse: a folded card still has to say what
                it is, or it is just a name and a chevron. */}
            <AppText
              variant="cardTitle"
              style={{ fontSize: 15, marginTop: 4, lineHeight: 20 }}
              numberOfLines={collapsed ? 2 : undefined}
            >
              {card.title}
            </AppText>
          </Pressable>
          {collapsed ? null : (
            <>
          <AppText variant="caption" color="textSecondary" style={{ marginTop: 6, lineHeight: 18 }}>
            {card.body}
          </AppText>
          <AppText variant="caption" color="textTertiary" style={{ marginTop: 6, fontSize: 11 }}>
            {card.cite}
          </AppText>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 11 }}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                onRead();
              }}
              accessibilityRole="button"
              accessibilityLabel={`Read about ${card.entryName}`}
              style={({ pressed }) => ({
                backgroundColor: theme.colors.textPrimary,
                borderRadius: theme.radii.pill,
                paddingVertical: 7,
                paddingHorizontal: 14,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <AppText variant="caption" style={{ color: theme.colors.surface, fontWeight: '800' }}>
                Read it
              </AppText>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                onDismiss();
              }}
              accessibilityRole="button"
              accessibilityLabel="Not now"
              style={({ pressed }) => ({ paddingVertical: 7, paddingHorizontal: 10, opacity: pressed ? 0.6 : 1 })}
            >
              <AppText variant="caption" color="textSecondary" style={{ fontWeight: '700' }}>
                Not now
              </AppText>
            </Pressable>
          </View>
            </>
          )}
        </View>
      </View>
    </View>
    </GlassEdge>
  );
}

function PlanCard({ plan }: { plan: PlanSummary }) {
  const theme = useTheme();
  // Was a purple wash. Purple now means a gauge (medication level, weight), so
  // the plan reads as chrome: the warm alt with a glass rim, which is what
  // separates it from the ground rather than a tint.
  return (
    <GlassEdge radius={theme.radii.card} backgroundColor={theme.colors.surfaceAlt}>
      <View style={{ padding: theme.spacing.lg }}>
      <AppText variant="caption" color="textSecondary" style={{ fontWeight: '700' }}>
        Your plan
      </AppText>
      <AppText variant="cardTitle" style={{ fontSize: 18, marginTop: 4 }}>
        {plan.title}
      </AppText>
      <AppText variant="caption" color="textSecondary" style={{ marginTop: 4 }}>
        {plan.detail}
      </AppText>
      </View>
    </GlassEdge>
  );
}

/**
 * The Log-a-shot section at the foot of the level card.
 *
 * Open by default on any day a dose is wanted — the card expands on its own,
 * which is the point. Close shuts it until tomorrow, and leaves a slim row
 * that re-opens it: collapsing an action must not destroy it.
 */
function DoseCtaSection({
  label,
  pulse,
  expanded,
  onPress,
  onClose,
  onReopen,
}: {
  label: string;
  pulse: boolean;
  expanded: boolean;
  onPress(): void;
  onClose(): void;
  onReopen(): void;
}) {
  const theme = useTheme();

  if (!expanded) {
    return (
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => undefined);
          onReopen();
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: false }}
        accessibilityLabel={label}
        style={({ pressed }) => ({
          flexDirection: 'row',
          justifyContent: 'center',
          marginTop: 12,
          paddingTop: 9,
          borderTopWidth: 0.5,
          borderTopColor: theme.colors.border,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        {/* The SAME quiet pill as Close, not bare purple text. Collapsed, this
            is a way back to an action the user has already dismissed — the
            frame keeps it in --alt/--ts so it reads as a handle rather than
            competing with the level reading directly above it. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingVertical: 3,
            paddingHorizontal: 12,
            borderRadius: theme.radii.pill,
            backgroundColor: theme.colors.surfaceAlt,
          }}
        >
          <Icon name="chevron-down" size={13} color={theme.colors.textSecondary} />
          <AppText variant="caption" color="textSecondary" style={{ fontSize: 10.5, fontWeight: '700' }}>
            {label}
          </AppText>
        </View>
      </Pressable>
    );
  }

  return (
    <>
      <LogDoseCta label={label} pulse={pulse} onPress={onPress} />
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => undefined);
          onClose();
        }}
        hitSlop={{ top: 8, bottom: 10, left: 30, right: 30 }}
        accessibilityRole="button"
        accessibilityState={{ expanded: true }}
        accessibilityLabel="Close"
        style={({ pressed }) => ({
          flexDirection: 'row',
          justifyContent: 'center',
          marginTop: 12,
          paddingTop: 9,
          borderTopWidth: 0.5,
          borderTopColor: theme.colors.border,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingVertical: 3,
            paddingHorizontal: 12,
            borderRadius: theme.radii.pill,
            backgroundColor: theme.colors.surfaceAlt,
          }}
        >
          <Icon name="chevron-up" size={13} color={theme.colors.textSecondary} />
          <AppText variant="caption" color="textSecondary" style={{ fontSize: 10.5, fontWeight: '700' }}>
            Close
          </AppText>
        </View>
      </Pressable>
    </>
  );
}

/** Ghost heights for the empty card — a shape, never a claim about a level. */
const GHOST_BARS = [20, 26, 22, 30, 26, 24, 32];
const BAR_MAX = 46;

/**
 * The week of level bars, each under its own day. `bars={null}` is the
 * first-run card: ghosts at 45%, but the day letters are still the real week,
 * because those are true whether or not anything has been logged.
 */
function LevelBars({ bars }: { bars: LevelBar[] | null }) {
  const theme = useTheme();
  const letters = useMemo(() => recentDayLetters(new Date()), []);
  const row = bars ?? GHOST_BARS.map((h, i) => ({
    height: h / BAR_MAX,
    letter: letters[i] ?? '',
    isToday: i === GHOST_BARS.length - 1,
  }));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
      {row.map((bar, i) => (
        <View key={i} style={{ alignItems: 'center', gap: 5 }}>
          <View
            style={{
              width: 7,
              height: Math.round(bar.height * BAR_MAX),
              borderRadius: 4,
              backgroundColor: bars && bar.isToday ? theme.colors.primary : '#E9E5FA',
              opacity: bars ? 1 : 0.45,
            }}
          />
          {/* Today's letter takes the accent with its bar. On the empty card
              nothing is accented — there is no level to point at. */}
          <AppText
            variant="caption"
            color={bars && bar.isToday ? 'primary' : 'textTertiary'}
            style={{ fontSize: 10 }}
          >
            {bar.letter}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const TASK_ICON: Record<string, string> = {
  account: 'checkmark',
  shot: 'medical',
  meal: 'food-drumstick',
  water: 'water',
  weight: 'scale',
};

function GettingStartedCard({ data, onTask }: { data: GettingStarted; onTask: (a: LogAction | null) => void }) {
  const theme = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Icon name="sparkles" size={16} color={theme.colors.primary} />
          <AppText variant="cardTitle" style={{ fontSize: 16 }}>
            Get started
          </AppText>
        </View>
        <AppText variant="caption" color="textSecondary">
          {data.doneCount} of {data.total}
        </AppText>
      </View>
      {/* One segment per task, not a continuous bar. The bar answered "how far
          along am I" with a fraction; the segments answer "how many left" by
          being countable — which is the question a five-item checklist raises. */}
      <View style={{ flexDirection: 'row', gap: 5, marginTop: 12, marginBottom: 4 }}>
        {data.tasks.map((task, i) => (
          <View
            key={task.key}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 999,
              // Fills left-to-right by COUNT, not per task: ticking off the
              // fourth item must not light the fourth segment and leave holes.
              // It is a meter reading "2 of 5", not a row of checkboxes.
              backgroundColor: i < data.doneCount ? theme.colors.primary : theme.colors.border,
            }}
          />
        ))}
      </View>
      {data.tasks.map((t, i) => {
        const tappable = !t.done && !!t.action;
        return (
          <Pressable
            key={t.key}
            onPress={() => {
              if (!tappable) return;
              Haptics.selectionAsync().catch(() => undefined);
              onTask(t.action);
            }}
            disabled={!tappable}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 11,
              paddingVertical: 11,
              borderTopWidth: i > 0 ? 0.5 : 0,
              borderTopColor: theme.colors.border,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: t.done ? '#E8F8EE' : theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={t.done ? 'checkmark' : TASK_ICON[t.key] ?? 'ellipse-outline'} size={15} color={t.done ? theme.colors.success : theme.colors.primary} />
            </View>
            <AppText
              variant="bodyStrong"
              style={{ flex: 1, fontWeight: t.done ? '500' : '700', color: t.done ? theme.colors.textTertiary : theme.colors.textPrimary, textDecorationLine: t.done ? 'line-through' : 'none' }}
            >
              {t.label}
            </AppText>
            {tappable ? <Icon name="chevron-forward" size={16} color={theme.colors.textTertiary} /> : null}
          </Pressable>
        );
      })}
    </Card>
  );
}

function FiberCard({
  stat,
  onMinus,
  onPlus,
  onOpen,
}: {
  stat: RingStat;
  onMinus: () => void;
  onPlus: () => void;
  onOpen: () => void;
}) {
  const theme = useTheme();
  return (
    <Card style={{ flex: 1 }}>
      {/* Same rule as the water card: the READING area is the door, the
          stepper stays a stepper. A card where every pixel navigates would
          make ±1 g a gamble. */}
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => undefined);
          onOpen();
        }}
        accessibilityRole="button"
        accessibilityLabel="Fiber. See ways to hit it"
        style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <CardIcon name="leaf" color={theme.colors.fiber} />
          <AppText variant="cardTitle" style={{ fontSize: 15 }}>
            Fiber
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 12 }}>
          <CountUp value={stat.current} variant="statBig" />
          <AppText variant="caption" color="textTertiary">
            {stat.target ? `/ ${stat.target} g` : 'g'}
          </AppText>
        </View>
        <View style={{ marginTop: 10 }}>
          <ProgressBar pct={stat.pct} color={theme.colors.fiber} height={6} />
        </View>
      </Pressable>
      <View style={{ marginTop: 'auto', paddingTop: 14 }}>
        <Stepper label="1 g" color={theme.colors.fiber} onMinus={onMinus} onPlus={onPlus} />
      </View>
    </Card>
  );
}

function WaterCard({
  stat,
  onMinus,
  onPlus,
  onOpen,
}: {
  stat: RingStat;
  onMinus: () => void;
  onPlus: () => void;
  onOpen: () => void;
}) {
  const theme = useTheme();
  return (
    <Card style={{ flex: 1 }}>
      {/* Tapping the glass opens the Water screen — the design's own note.
          The stepper stays for the ±8 you already know about; the glass is
          the door to a different vessel, a drink with electrolytes in it, or
          a typed amount. Only the glass is pressable, so a thumb aiming at
          the stepper never navigates away by accident. */}
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => undefined);
          onOpen();
        }}
        accessibilityRole="button"
        accessibilityLabel="Water. Open hydration"
        style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <CardIcon name="water" color={theme.colors.water} />
          <AppText variant="cardTitle" style={{ fontSize: 15 }}>
            Water
          </AppText>
        </View>
        <View style={{ alignItems: 'center', marginVertical: 6 }}>
          <WaterCup value={stat.current} target={stat.target} color={theme.colors.water} size={120} />
          <AppText variant="caption" color="textTertiary" style={{ fontSize: 11, marginTop: 2 }}>
            {stat.target ? `/ ${stat.target} oz` : ''}
          </AppText>
        </View>
      </Pressable>
      <Stepper label="8 oz" color={theme.colors.water} onMinus={onMinus} onPlus={onPlus} />
    </Card>
  );
}

// The halo behind the "now" dot and the card's corner glow. Derived from the
// one accent so they cannot drift apart.
const WEIGHT_GLOW = 'rgba(124,92,252,0.08)';
// The frame's Log-a-meal tint (#FFF1E6). Its own value, not protein@13%: the
// frame picked a warmer peach than the chip formula gives.
const MEAL_CTA_BG = '#FFF1E6';
// The frame's Log-weight label. Its own grey, not a theme token: the button
// sits on --alt and the text is deliberately quieter than textSecondary.
const LOGCTA_TEXT = '#5E636E';
const ACTIVITY_WASH = 'rgba(255,107,90,0.10)';

/**
 * The milestone track: where they stand, the round numbers between here and
 * the goal, and the flag. Replaces a progress bar whose fill is nearly empty
 * for the months that matter most.
 */
function MilestoneTrackView({ goal }: { goal: GoalView }) {
  const theme = useTheme();
  const { track } = goal;
  const unit = goal.unit;

  if (track.reached) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 }}>
        <Icon name="flag" size={16} color={theme.colors.weight} stroke={2.4} />
        <AppText variant="caption" style={{ color: theme.colors.weight, fontWeight: '800' }}>
          Goal reached — {track.goal} {unit}
        </AppText>
      </View>
    );
  }

  return (
    <View style={{ marginTop: 14 }}>
      {/* EVENLY-SPACED COLUMNS, EACH CARRYING ITS OWN LABEL — no connecting
          rail. The rail was the tell that this was still a progress bar
          underneath. The frame draws marks on a route, and a route is read by
          its NUMBERS: without 195 / 190 / 185 under the dots a milestone track
          cannot say what the milestones are, which is the only reason it beats
          a percentage. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {[
          { key: 'now', label: 'now', kind: 'now' as const },
          ...track.markers.map((mark) => ({ key: String(mark), label: String(mark), kind: 'mark' as const })),
          { key: 'goal', label: String(track.goal), kind: 'goal' as const },
        ].map((col) => (
          <View key={col.key} style={{ flex: 1, alignItems: 'center', gap: 5 }}>
            {col.kind === 'goal' ? (
              <Icon name="flag" size={13} color={theme.colors.textTertiary} stroke={2.2} />
            ) : (
              <View
                style={
                  col.kind === 'now'
                    ? {
                        width: 11,
                        height: 11,
                        borderRadius: 999,
                        backgroundColor: theme.colors.weight,
                        // The halo is what makes "now" read as a POSITION and
                        // not merely a darker dot, at a size where 11 against 9
                        // is invisible.
                        borderWidth: 4,
                        borderColor: WEIGHT_GLOW,
                      }
                    : { width: 9, height: 9, borderRadius: 999, backgroundColor: theme.colors.border }
                }
              />
            )}
            <AppText
              variant="caption"
              style={
                col.kind === 'now'
                  ? { fontSize: 9, fontWeight: '700', color: theme.colors.textPrimary }
                  : { fontSize: 9, color: theme.colors.textTertiary }
              }
            >
              {col.label}
            </AppText>
          </View>
        ))}
      </View>

      {/* One sentence, not two numbers pushed to opposite ends: the distance
          belongs to the marker it is a distance TO. */}
      <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 10 }}>
        {track.next != null ? 'Next marker ' : 'Goal '}
        <AppText variant="caption" style={{ fontSize: 10.5, fontWeight: '700', color: theme.colors.textPrimary }}>
          {track.next ?? track.goal} {unit}
        </AppText>
        {` — ${track.toNext} ${unit} away.`}
      </AppText>
    </View>
  );
}

/**
 * The Meals tile. Calories rather than a fourth stepper: meals are the one
 * thing on this grid that cannot be logged with a plus button, so the tile's
 * job is to state the number and open the sheet that can actually take one.
 */
function MealsCard({ stat, onLog }: { stat: RingStat; onLog(): void }) {
  const theme = useTheme();
  return (
    <Card style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <CardIcon name="restaurant" color={theme.colors.protein} />
        <AppText variant="cardTitle" style={{ fontSize: 15 }}>
          Meals
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 12 }}>
        <CountUp value={Math.round(stat.current)} variant="statBig" />
        <AppText variant="caption" color="textTertiary">
          {stat.target ? `/ ${Math.round(stat.target).toLocaleString()}` : 'cal'}
        </AppText>
      </View>
      <View style={{ marginTop: 10 }}>
        <ProgressBar pct={stat.pct} color={theme.colors.protein} height={6} />
      </View>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => undefined);
          onLog();
        }}
        accessibilityRole="button"
        accessibilityLabel="Log a meal"
        style={({ pressed }) => ({
          marginTop: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          // .logcta with the frame's meal override: #FFF1E6 on protein, 38pt.
          // Grey on grey made the one action on this card disappear into it.
          height: 38,
          borderRadius: theme.radii.pill,
          backgroundColor: MEAL_CTA_BG,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Icon name="add" size={14} color={theme.colors.protein} stroke={2.6} />
        <AppText variant="caption" style={{ fontWeight: '800', fontSize: 13, color: theme.colors.protein }}>
          Log a meal
        </AppText>
      </Pressable>
    </Card>
  );
}


function HomeWeightPulseCard({
  pulse,
  goal,
  onLog,
}: {
  pulse: HomeWeightPulseView;
  goal: GoalView | null;
  onLog(): void;
}) {
  const theme = useTheme();
  const hasWeight = pulse.latestLabel != null;
  return (
    <Card style={{ overflow: 'hidden' }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -34,
          right: -18,
          width: 120,
          height: 120,
          borderRadius: 60,
          backgroundColor: WEIGHT_GLOW,
        }}
      />
      {/* TITLE ROW: the card is named for what it holds, and the distance sits
          in a quiet pill beside it. The old version led with an eyebrow, a
          question and a line of encouragement, which pushed the reading — the
          only thing actually being reported — into a corner. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* The frame's `.ic` chip: an 18px glyph in 8.5px of padding (a 35pt
              box), radius 11, on the icon's OWN colour at 13% —
              color-mix(in srgb, currentColor 13%, transparent). A bare glyph
              left the title row visibly lighter than every other card header. */}
<CardIcon name="scale" color={theme.colors.weight} stroke={2.4} />
          <AppText variant="cardTitle" style={{ fontSize: 15.5 }}>
            Weight
          </AppText>
        </View>
        {goal ? (
          <View
            style={{
              paddingVertical: 5,
              paddingHorizontal: 11,
              borderRadius: theme.radii.pill,
              backgroundColor: theme.colors.surfaceAlt,
            }}
          >
            <AppText variant="caption" color="textSecondary" style={{ fontSize: 11.5 }}>
              {goal.trackLabel}
            </AppText>
          </View>
        ) : null}
      </View>

      {/* The reading, then when it was taken. A dash rather than a blank: the
          card keeps its shape and reads as waiting, not broken. */}
      <View style={{ marginTop: 12 }}>
        {/* NUMBER AND UNIT ARE DIFFERENT SIZES — the frame's `.big` (26px/800,
            accent) against `.unit` (15px/700, secondary). Rendering
            "199.5 lb" as one string made the unit shout as loudly as the
            reading, which is the one thing on this card that matters. */}
        <AppText variant="cardTitle" style={{ fontSize: 26, letterSpacing: -0.6, color: theme.colors.weight }}>
          {hasWeight && goal ? String(goal.value) : '—'}
          <AppText variant="cardTitle" style={{ fontSize: 15, color: theme.colors.textSecondary }}>
            {hasWeight && goal ? ` ${goal.unit}` : ''}
          </AppText>
        </AppText>
        <AppText variant="caption" color="textSecondary" style={{ marginTop: 6, fontSize: 12.5 }}>
          {hasWeight && goal ? `Last check ${goal.dateLabel}` : 'No weigh-in yet'}
        </AppText>
      </View>
      {goal ? <MilestoneTrackView goal={goal} /> : null}
      {/* FULL WIDTH, and quiet. The frame gives this the neutral surface rather
          than the weight tint: it is the routine action on a status card, not
          the card's point. The reassurance line that sat beside it has gone
          with the question it was reassuring about. */}
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => undefined);
          onLog();
        }}
        style={({ pressed }) => ({
          marginTop: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          height: 44,
          borderRadius: theme.radii.pill,
          backgroundColor: theme.colors.surfaceAlt,
          opacity: pressed ? 0.72 : 1,
        })}
      >
        <Icon name="add" size={15} color={LOGCTA_TEXT} stroke={2.6} />
        <AppText variant="caption" style={{ color: LOGCTA_TEXT, fontWeight: '800', fontSize: 14 }}>
          {pulse.actionLabel}
        </AppText>
      </Pressable>
    </Card>
  );
}

function ActivityCard({
  activity,
  onLog,
  onSetResistance,
}: {
  activity: ActivitySummary;
  onLog(): void;
  onSetResistance(next: boolean): void;
}) {
  const theme = useTheme();
  const stepsPct = activity.stepTarget > 0 ? Math.min(1, activity.steps / activity.stepTarget) : 0;
  const workoutPct = activity.workoutTarget > 0 ? Math.min(1, activity.workoutMin / activity.workoutTarget) : 0;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="run" size={18} color={theme.colors.activity} />
        <AppText variant="cardTitle" style={{ fontSize: 16 }}>
          Activity
        </AppText>
        {/* The card showed two bars and offered no way to move them. */}
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            onLog();
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Log a workout"
          style={({ pressed }) => ({
            marginLeft: 'auto',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingVertical: 5,
            paddingHorizontal: 10,
            borderRadius: theme.radii.pill,
            backgroundColor: ACTIVITY_WASH,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Icon name="add" size={13} color={theme.colors.activity} stroke={2.6} />
          <AppText variant="caption" style={{ color: theme.colors.activity, fontWeight: '800', fontSize: 11 }}>
            Log
          </AppText>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
        <AppText variant="caption" color="textSecondary">
          Steps
        </AppText>
        <AppText variant="caption" style={{ fontWeight: '700' }}>
          {activity.steps.toLocaleString()}{' '}
          <AppText variant="caption" color="textTertiary">
            / {activity.stepTarget.toLocaleString()}
          </AppText>
        </AppText>
      </View>
      <View style={{ marginTop: 8 }}>
        <ProgressBar pct={stepsPct} color={theme.colors.activity} height={6} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
        <AppText variant="caption" color="textSecondary">
          Workout
        </AppText>
        <AppText variant="caption" style={{ fontWeight: '700' }}>
          {activity.workoutMin}{' '}
          <AppText variant="caption" color="textTertiary">
            / {activity.workoutTarget} min
          </AppText>
        </AppText>
      </View>
      <View style={{ marginTop: 8 }}>
        <ProgressBar pct={workoutPct} color={theme.colors.activity} height={6} />
      </View>
      {/* The one row on Home that feeds Muscle protection directly, and says
          so. Lifting is what protects lean mass on a GLP-1, and it is a
          yes/no about today rather than a number to enter — so it is a switch
          and not another field. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginTop: 14,
          paddingTop: 12,
          borderTopWidth: 0.5,
          borderTopColor: theme.colors.border,
        }}
      >
        <View style={{ flexShrink: 1 }}>
          <AppText variant="caption" style={{ fontWeight: '700' }}>
            Resistance today
          </AppText>
          <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 2 }}>
            Counts toward muscle protection
          </AppText>
        </View>
        <Switch
          value={activity.resistanceToday}
          onValueChange={(next) => {
            Haptics.selectionAsync().catch(() => undefined);
            onSetResistance(next);
          }}
          accessibilityLabel="Resistance training today"
          trackColor={{ false: theme.colors.surfaceAlt, true: theme.colors.activity }}
          thumbColor="#FFFFFF"
        />
      </View>
    </Card>
  );
}

const LOG_META: Record<LogKind, { icon: string; color: string }> = {
  shot: { icon: 'needle', color: '#7C5CFC' },
  meal: { icon: 'nutrition', color: '#FF8A3D' },
  water: { icon: 'water', color: '#2FA8FF' },
  protein: { icon: 'nutrition', color: '#FF8A3D' },
  weight: { icon: 'scale', color: '#E25CC4' },
  sideEffect: { icon: 'sad', color: '#FFB020' },
  measurement: { icon: 'resize', color: '#E25CC4' },
  activity: { icon: 'walk', color: '#34C759' },
};

function TodaysLogCard({ chips, rangeLabel, onSeeAll }: { chips: LogChip[]; rangeLabel: string; onSeeAll(): void }) {
  const theme = useTheme();
  const title = rangeLabel === 'Today' ? 'Today’s Log' : `${rangeLabel} Log`;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="list" size={18} color={theme.colors.textSecondary} />
          <AppText variant="cardTitle" style={{ fontSize: 16 }}>
            {title} ({chips.length})
          </AppText>
        </View>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            onSeeAll();
          }}
          hitSlop={8}
        >
          <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
            See all
          </AppText>
        </Pressable>
      </View>
      {chips.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {chips.slice(0, 12).map((c, i) => {
            const meta = LOG_META[c.kind];
            return (
              <View key={`${c.kind}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.colors.surfaceAlt, paddingVertical: 6, paddingHorizontal: 10, borderRadius: theme.radii.pill }}>
                <Icon name={meta.icon} size={13} color={meta.color} />
                <AppText variant="caption" style={{ fontWeight: '600' }}>
                  {c.label}
                </AppText>
              </View>
            );
          })}
        </View>
      ) : (
        <AppText variant="caption" color="textTertiary" style={{ marginTop: 12 }}>
          Nothing logged yet — tap + to add your first entry.
        </AppText>
      )}
    </Card>
  );
}

function MacroRingCard({
  title,
  icon,
  stat,
  unit,
  color,
  stepper,
  onExamples,
}: {
  title: string;
  icon: React.ReactNode;
  stat: RingStat;
  unit: string;
  color: string;
  stepper?: React.ReactNode;
  /** Opens the "ways to hit it" screen. Omitted where there is no such screen. */
  onExamples?: () => void;
}) {
  const theme = useTheme();
  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        {icon}
        <AppText variant="cardTitle" style={{ fontSize: 15 }}>
          {title}
        </AppText>
      </View>
      <View style={{ alignItems: 'center', marginVertical: 10 }}>
        <ProgressRing size={108} pct={stat.pct} color={color}>
          <View style={{ alignItems: 'center' }}>
            <CountUp value={stat.current} variant="statMedium" />
            <AppText variant="caption" color="textTertiary" style={{ fontSize: 11 }}>
              {stat.target ? `/ ${stat.target} ${unit}` : `${unit} today`}
            </AppText>
          </View>
        </ProgressRing>
      </View>
    </>
  );

  return (
    <Card>
      {/* The ring is the door when there is a screen behind it; the stepper
          below is never inside the pressable. */}
      {onExamples ? (
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            onExamples();
          }}
          accessibilityRole="button"
          accessibilityLabel={`${title}. See ways to hit it`}
          style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
      {stepper}
      {onExamples ? (
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            onExamples();
          }}
          hitSlop={{ top: 8, bottom: 10, left: 20, right: 20 }}
          accessibilityRole="button"
          accessibilityLabel={`See ${title.toLowerCase()} examples`}
          style={({ pressed }) => ({
            // border-top:.5px solid var(--hair); padding-top:9px — the rule is
            // what separates the link from the stepper above it.
            marginTop: 10,
            paddingTop: 9,
            borderTopWidth: 0.5,
            borderTopColor: theme.colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <AppText variant="caption" style={{ fontSize: 11.5, fontWeight: '700', color }}>
            See examples
          </AppText>
          <Icon name="chevron-forward" size={13} color={color} stroke={2.4} />
        </Pressable>
      ) : null}
    </Card>
  );
}

function CenteredState({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing['2xl'] }}>
        {children}
      </SafeAreaView>
    </View>
  );
}

function Stepper({ label, color, onMinus, onPlus }: { label: string; color: string; onMinus(): void; onPlus(): void }) {
  const theme = useTheme();
  const btn = (name: 'remove' | 'add', onPress: () => void, tint: string) => (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      hitSlop={6}
      style={{
        width: 30,
        height: 30,
        borderRadius: theme.radii.pill,
        backgroundColor: theme.colors.surface,
        borderWidth: 0.5,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        // raised "button" depth (lab .sbtn: 0 1px 2px rgba(17,17,26,.05))
        shadowColor: '#11111A',
        shadowOpacity: 0.06,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      }}
    >
      <Icon name={name} size={17} color={tint} stroke={2.1} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radii.pill, padding: 4 }}>
      {btn('remove', onMinus, theme.colors.textSecondary)}
      <AppText style={{ fontWeight: '700', fontSize: 13 }}>
        {label}
      </AppText>
      {btn('add', onPlus, color)}
    </View>
  );
}
