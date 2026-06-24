// Home tab — the tracker dashboard. Wired to PeptaDataContext (GET /home): first
// load → loading, failure → error (retry), success → the cards. Pull-to-refresh,
// staggered entrance, ring fills + count-ups, optimistic+persisted inline steppers.
//
// Surfaces everything HomeResponse provides: medication level + next dose, today's
// calories / protein / fiber / water vs. their profile targets, logging streak,
// setup progress, latest weight, and the first insight.

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Icon } from "../../components/Icon";
import * as Haptics from 'expo-haptics';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { HomeRangeKey } from '@pepta/shared';
import { useTheme } from '../../theme';
import { AppText, Button, Card, CountUp, Mascot, ProgressBar, ProgressRing, Reveal, SectionErrorBanner, WaterCup } from '../../components';
import { usePeptaData } from '../../context/PeptaDataContext';
import { useLogSheets } from '../../context/LogSheetsContext';
import { buildHomeView, type GoalView, type HomeWeightPulseView, type RingStat } from './homeView';
import { buildActivity, buildTodaysLog, type ActivitySummary, type LogChip, type LogKind } from './homeExtras';
import { buildGettingStarted, buildPlanSummary, type GettingStarted, type LogAction, type PlanSummary } from './planView';

const HOME_RANGES: { key: HomeRangeKey; label: string; short: string }[] = [
  { key: 'today', label: 'Today', short: 'Day' },
  { key: 'week', label: 'Weekly', short: 'Week' },
  { key: 'month', label: 'Monthly', short: 'Month' },
  { key: 'year', label: 'Yearly', short: 'Year' },
];

export function HomeScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavigationProp<Record<string, undefined>>>();
  const { home, track, homeLoading, homeError, homeRefreshing, homeRange, refreshHome, refreshTrack, bumpProtein, bumpWater, bumpFiber } = usePeptaData();
  const { openQuickLog, openMeal } = useLogSheets();
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
  }, [home, track, refreshHome, refreshTrack]);

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

  const view = buildHomeView(home);
  const plan = buildPlanSummary(home);
  const gettingStarted = buildGettingStarted(home);
  const selectedRange = home.selectedRange ?? homeRange;
  const rangeAvailability = home.rangeAvailability ?? { today: true, week: false, month: false, year: false };
  const activity = buildActivity(track, home.profile, new Date(), selectedRange);
  const todaysLog = buildTodaysLog(track, home, new Date(), selectedRange);
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
              <View style={{ width: 34, height: 34, borderRadius: theme.radii.pill, backgroundColor: '#EFEBFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <Mascot pose="idle" size={29} />
              </View>
              <AppText variant="screenTitle" style={{ fontSize: 21 }}>
                Pepta
              </AppText>
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 11, borderRadius: theme.radii.pill, backgroundColor: '#FFF1E8' }}>
                  <Icon name="fire" size={14} color={theme.colors.streak} />
                  <AppText variant="caption" style={{ fontWeight: '700', color: theme.colors.streak }}>
                    {view.streakDays}
                  </AppText>
                </View>
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

          {/* medication level */}
          <Reveal delay={60} style={{ marginTop: theme.spacing.lg }}>
            {view.medication ? (
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon name="needle" size={18} color={theme.colors.primary} />
                    <AppText variant="cardTitle" style={{ fontSize: 15 }}>
                      Medication Level
                    </AppText>
                    <Icon name="information-circle-outline" size={14} color={theme.colors.textTertiary} />
                  </View>
                  <View style={{ backgroundColor: theme.colors.surfaceAlt, paddingVertical: 5, paddingHorizontal: 11, borderRadius: theme.radii.pill }}>
                    <AppText variant="caption" color="textSecondary" style={{ fontWeight: '600' }}>
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
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 46 }}>
                    {view.medication.bars.map((h, i) => (
                      <View
                        key={i}
                        style={{
                          width: 7,
                          height: Math.round(h * 46),
                          borderRadius: 4,
                          backgroundColor: i === view.medication!.bars.length - 1 ? theme.colors.primary : '#E7E1FF',
                        }}
                      />
                    ))}
                  </View>
                </View>
                {view.medication.countdown ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: theme.spacing.md, paddingTop: theme.spacing.sm, borderTopWidth: 0.5, borderTopColor: theme.colors.border }}>
                    <Icon name="time-outline" size={14} color={theme.colors.textSecondary} />
                    <AppText variant="caption" color="textSecondary">
                      Next shot in {view.medication.countdown}
                    </AppText>
                  </View>
                ) : null}
              </Card>
            ) : (
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon name="needle" size={18} color={theme.colors.primary} />
                    <AppText variant="cardTitle" style={{ fontSize: 15 }}>
                      Medication Level
                    </AppText>
                    <Icon name="information-circle-outline" size={14} color={theme.colors.textTertiary} />
                  </View>
                  <View style={{ backgroundColor: theme.colors.surfaceAlt, paddingVertical: 5, paddingHorizontal: 11, borderRadius: theme.radii.pill }}>
                    <AppText variant="caption" color="textTertiary" style={{ fontWeight: '600' }}>
                      No doses yet
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
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 46 }}>
                    {[20, 26, 22, 30, 26, 24, 32].map((h, i) => (
                      <View key={i} style={{ width: 7, height: h, borderRadius: 4, backgroundColor: '#E7E1FF' }} />
                    ))}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: theme.spacing.md, paddingTop: theme.spacing.sm, borderTopWidth: 0.5, borderTopColor: theme.colors.border }}>
                  <Icon name="time-outline" size={14} color={theme.colors.textSecondary} />
                  <AppText variant="caption" color="textSecondary">
                    Log your first shot to start tracking levels.
                  </AppText>
                </View>
              </Card>
            )}
          </Reveal>

          {/* macros + goal — column-stack grid (fiber/protein | water/goal) */}
          <Reveal delay={200} style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <View style={{ flex: 1, gap: 12 }}>
              <FiberCard stat={view.fiber} onMinus={() => bumpFiber(-1)} onPlus={() => bumpFiber(1)} />
              <MacroRingCard
                title="Protein"
                icon={<Icon name="food-drumstick" size={18} color={theme.colors.protein} stroke={2.3} />}
                stat={view.protein}
                unit="g"
                color={theme.colors.protein}
                stepper={<Stepper label="5 g" color={theme.colors.protein} onMinus={() => bumpProtein(-5)} onPlus={() => bumpProtein(5)} />}
              />
            </View>
            <View style={{ flex: 1, gap: 12 }}>
              <WaterCard stat={view.water} onMinus={() => bumpWater(-8)} onPlus={() => bumpWater(8)} />
              <GoalCard goal={view.goal} />
            </View>
          </Reveal>

          <Reveal delay={250} style={{ marginTop: 12 }}>
            <HomeWeightPulseCard pulse={view.weightPulse} onLog={() => openQuickLog('weight')} />
          </Reveal>

          {/* activity */}
          <Reveal delay={280} style={{ marginTop: 12 }}>
            <ActivityCard activity={activity} />
          </Reveal>

          {/* today's log */}
          <Reveal delay={340} style={{ marginTop: 12 }}>
            <TodaysLogCard chips={todaysLog} rangeLabel={view.rangeLabel} onSeeAll={() => navigation.navigate('FoodHistory')} />
          </Reveal>

          {/* insight */}
          {view.insight ? (
            <Reveal delay={460} style={{ marginTop: 12 }}>
              <Card style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <Mascot pose="idle" size={32} />
                </View>
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

function PlanCard({ plan }: { plan: PlanSummary }) {
  return (
    <Card style={{ backgroundColor: '#EFEBFF', borderWidth: 0 }}>
      <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
        Your plan
      </AppText>
      <AppText variant="cardTitle" style={{ fontSize: 18, marginTop: 4 }}>
        {plan.title}
      </AppText>
      <AppText variant="caption" color="textSecondary" style={{ marginTop: 4 }}>
        {plan.detail}
      </AppText>
    </Card>
  );
}

const TASK_ICON: Record<string, string> = {
  account: 'checkmark',
  shot: 'medical',
  meal: 'restaurant',
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
      <View style={{ marginTop: 10, marginBottom: 4 }}>
        <ProgressBar pct={data.total ? data.doneCount / data.total : 0} color={theme.colors.primary} height={6} />
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

function FiberCard({ stat, onMinus, onPlus }: { stat: RingStat; onMinus: () => void; onPlus: () => void }) {
  const theme = useTheme();
  return (
    <Card style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Icon name="leaf" size={18} color={theme.colors.fiber} stroke={2.3} />
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
      <View style={{ marginTop: 'auto', paddingTop: 14 }}>
        <Stepper label="1 g" color={theme.colors.fiber} onMinus={onMinus} onPlus={onPlus} />
      </View>
    </Card>
  );
}

function WaterCard({ stat, onMinus, onPlus }: { stat: RingStat; onMinus: () => void; onPlus: () => void }) {
  const theme = useTheme();
  return (
    <Card style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Icon name="water" size={18} color={theme.colors.water} stroke={2.3} />
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
      <Stepper label="8 oz" color={theme.colors.water} onMinus={onMinus} onPlus={onPlus} />
    </Card>
  );
}

function GoalCard({ goal }: { goal: GoalView | null }) {
  const theme = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Icon name="scale" size={18} color={theme.colors.weight} stroke={2.3} />
        <AppText variant="cardTitle" style={{ fontSize: 15 }}>
          Goal
        </AppText>
      </View>
      {goal ? (
        <>
          <View style={{ marginTop: 12, alignSelf: 'flex-start', backgroundColor: '#FBEAF6', paddingVertical: 4, paddingHorizontal: 10, borderRadius: theme.radii.pill }}>
            <AppText variant="caption" style={{ color: '#A8327D', fontWeight: '700' }}>
              {Math.round(goal.pct * 100)}% of goal
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 12 }}>
            <CountUp value={goal.value} variant="statBig" />
            <AppText variant="caption" color="textSecondary">
              {goal.unit}
            </AppText>
          </View>
          <AppText variant="caption" color="textTertiary" style={{ marginTop: 6 }}>
            {goal.dateLabel}
          </AppText>
        </>
      ) : (
        <AppText variant="caption" color="textSecondary" style={{ marginTop: 12 }}>
          Log your weight to track progress.
        </AppText>
      )}
    </Card>
  );
}

function HomeWeightPulseCard({ pulse, onLog }: { pulse: HomeWeightPulseView; onLog(): void }) {
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
          backgroundColor: 'rgba(226,92,196,0.08)',
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 18,
            backgroundColor: '#FBEAF6',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="scale" size={20} color={theme.colors.weight} stroke={2.4} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="caption" color="textTertiary" style={{ fontWeight: '800', fontSize: 10, textTransform: 'uppercase' }}>
            Scale check
          </AppText>
          <AppText variant="cardTitle" style={{ fontSize: 16, marginTop: 2 }}>
            {pulse.title}
          </AppText>
          <AppText variant="caption" color="textSecondary" style={{ marginTop: 4, lineHeight: 17 }}>
            {pulse.detail}
          </AppText>
        </View>
        {hasWeight ? (
          <View style={{ alignItems: 'flex-end' }}>
            <AppText variant="statMedium" style={{ color: theme.colors.weight }}>
              {pulse.latestLabel}
            </AppText>
            <AppText variant="caption" color="textTertiary" style={{ fontSize: 10 }}>
              latest
            </AppText>
          </View>
        ) : null}
      </View>
      <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            onLog();
          }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            paddingVertical: 9,
            paddingHorizontal: 13,
            borderRadius: theme.radii.pill,
            backgroundColor: '#FBEAF6',
            borderWidth: 1,
            borderColor: 'rgba(226,92,196,0.16)',
            opacity: pressed ? 0.72 : 1,
          })}
        >
          <Icon name="add" size={15} color={theme.colors.weight} stroke={2.6} />
          <AppText variant="caption" style={{ color: theme.colors.weight, fontWeight: '800' }}>
            {pulse.actionLabel}
          </AppText>
        </Pressable>
        <AppText variant="caption" color="textTertiary" style={{ flex: 1, lineHeight: 16 }}>
          No pressure. One quick check-in keeps your trend honest.
        </AppText>
      </View>
    </Card>
  );
}

function ActivityCard({ activity }: { activity: ActivitySummary }) {
  const theme = useTheme();
  const stepsPct = activity.stepTarget > 0 ? Math.min(1, activity.steps / activity.stepTarget) : 0;
  const workoutPct = activity.workoutTarget > 0 ? Math.min(1, activity.workoutMin / activity.workoutTarget) : 0;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="run" size={18} color={theme.colors.fiber} />
        <AppText variant="cardTitle" style={{ fontSize: 16 }}>
          Activity
        </AppText>
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
        <ProgressBar pct={stepsPct} color={theme.colors.fiber} height={6} />
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
        <ProgressBar pct={workoutPct} color={theme.colors.fiber} height={6} />
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
}: {
  title: string;
  icon: React.ReactNode;
  stat: RingStat;
  unit: string;
  color: string;
  stepper?: React.ReactNode;
}) {
  return (
    <Card>
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
      {stepper}
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
