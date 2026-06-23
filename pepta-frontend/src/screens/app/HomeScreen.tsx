// Home tab — the tracker dashboard. Wired to PeptaDataContext (GET /home): first
// load → loading, failure → error (retry), success → the cards. Pull-to-refresh,
// staggered entrance, ring fills + count-ups, optimistic+persisted inline steppers.
//
// Surfaces everything HomeResponse provides: medication level + next dose, today's
// calories / protein / fiber / water vs. their profile targets, logging streak,
// setup progress, latest weight, and the first insight.

import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { AppText, Button, Card, CountUp, Mascot, ProgressBar, ProgressRing, Reveal, SectionErrorBanner } from '../../components';
import { usePeptaData } from '../../context/PeptaDataContext';
import { useLogSheets } from '../../context/LogSheetsContext';
import { buildHomeView, type RingStat } from './homeView';
import { buildGettingStarted, buildPlanSummary, type GettingStarted, type LogAction, type PlanSummary } from './planView';

export function HomeScreen() {
  const theme = useTheme();
  const { home, homeLoading, homeError, homeRefreshing, refreshHome, bumpProtein, bumpWater } = usePeptaData();
  const { openQuickLog, openMeal } = useLogSheets();

  const onTask = (action: LogAction | null) => {
    if (action === 'meal') openMeal();
    else if (action === 'water') openQuickLog('water');
    else if (action === 'weight') openQuickLog('weight');
    else if (action === 'dose') openQuickLog('dose');
  };

  useEffect(() => {
    if (!home) void refreshHome();
  }, [home, refreshHome]);

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
  const caloriesLeft = view.calories.target ? Math.max(0, view.calories.target - view.calories.current) : null;
  const plan = buildPlanSummary(home);
  const gettingStarted = buildGettingStarted(home);

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
          {/* header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <View style={{ width: 34, height: 34, borderRadius: theme.radii.pill, backgroundColor: '#EFEBFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <Mascot pose="idle" size={29} />
              </View>
              <AppText variant="screenTitle" style={{ fontSize: 21 }}>
                Pepta
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              {view.streakDays > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 11, borderRadius: theme.radii.pill, backgroundColor: '#FFF1E8' }}>
                  <MaterialCommunityIcons name="fire" size={14} color={theme.colors.streak} />
                  <AppText variant="caption" style={{ fontWeight: '700', color: theme.colors.streak }}>
                    {view.streakDays}
                  </AppText>
                </View>
              ) : null}
              <View style={{ width: 34, height: 34, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="sparkles" size={18} color={theme.colors.primary} />
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
                    <MaterialCommunityIcons name="needle" size={18} color={theme.colors.primary} />
                    <AppText variant="sectionHeader" color="primary">
                      Medication level
                    </AppText>
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
                    <Ionicons name="time-outline" size={14} color={theme.colors.textSecondary} />
                    <AppText variant="caption" color="textSecondary">
                      Next shot in {view.medication.countdown}
                    </AppText>
                  </View>
                ) : null}
              </Card>
            ) : (
              <EmptyCard
                icon={<MaterialCommunityIcons name="needle" size={22} color={theme.colors.primary} />}
                line="Tap + to log your first shot — I’ll start tracking your levels."
              />
            )}
          </Reveal>

          {/* calories */}
          <Reveal delay={120} style={{ marginTop: 12 }}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
              <ProgressRing size={96} pct={view.calories.pct} color={theme.colors.textPrimary}>
                <View style={{ alignItems: 'center' }}>
                  <CountUp value={view.calories.current} variant="statMedium" />
                  <AppText variant="caption" color="textTertiary" style={{ fontSize: 11 }}>
                    eaten
                  </AppText>
                </View>
              </ProgressRing>
              <View style={{ flex: 1 }}>
                <AppText variant="cardTitle" style={{ fontSize: 16 }}>
                  Calories
                </AppText>
                {caloriesLeft != null ? (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 6 }}>
                      <CountUp value={caloriesLeft} variant="statBig" />
                      <AppText variant="caption" color="textSecondary">
                        kcal left
                      </AppText>
                    </View>
                    <AppText variant="caption" color="textTertiary" style={{ marginTop: 4 }}>
                      of {view.calories.target?.toLocaleString()} target
                    </AppText>
                  </>
                ) : (
                  <AppText variant="caption" color="textSecondary" style={{ marginTop: 6 }}>
                    {view.calories.current.toLocaleString()} kcal today
                  </AppText>
                )}
              </View>
            </Card>
          </Reveal>

          {/* protein + water */}
          <Reveal delay={200} style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <MacroRingCard
              title="Protein"
              icon={<MaterialCommunityIcons name="food-drumstick" size={17} color={theme.colors.protein} />}
              stat={view.protein}
              unit="g"
              color={theme.colors.protein}
              stepper={<Stepper label="5 g" color={theme.colors.protein} onMinus={() => bumpProtein(-5)} onPlus={() => bumpProtein(5)} />}
            />
            <MacroRingCard
              title="Water"
              icon={<Ionicons name="water" size={17} color={theme.colors.water} />}
              stat={view.water}
              unit="oz"
              color={theme.colors.water}
              stepper={<Stepper label="8 oz" color={theme.colors.water} onMinus={() => bumpWater(-8)} onPlus={() => bumpWater(8)} />}
            />
          </Reveal>

          {/* fiber + streak */}
          <Reveal delay={280} style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <MacroRingCard
              title="Fiber"
              icon={<MaterialCommunityIcons name="grain" size={17} color={theme.colors.fiber} />}
              stat={view.fiber}
              unit="g"
              color={theme.colors.fiber}
            />
            <Card style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <MaterialCommunityIcons name="fire" size={26} color={theme.colors.streak} />
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <CountUp value={view.streakDays} variant="statBig" color="streak" />
                <AppText variant="caption" color="textSecondary">
                  days
                </AppText>
              </View>
              <AppText variant="caption" color="textTertiary">
                {view.streakDays > 0 ? 'Logging streak' : 'Start your streak'}
              </AppText>
            </Card>
          </Reveal>

          {/* setup progress */}
          {view.setup ? (
            <Reveal delay={340} style={{ marginTop: 12 }}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: theme.radii.pill, backgroundColor: '#EFEBFF', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="rocket" size={20} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" style={{ fontWeight: '700' }}>
                    Finish setup
                  </AppText>
                  <AppText variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
                    {view.setup.loggedItems} of {view.setup.required} logged to unlock your full dashboard
                  </AppText>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.surfaceAlt, marginTop: 8, overflow: 'hidden' }}>
                    <View style={{ width: `${Math.round(view.setup.pct * 100)}%`, height: 6, borderRadius: 3, backgroundColor: theme.colors.primary }} />
                  </View>
                </View>
              </Card>
            </Reveal>
          ) : null}

          {/* weight */}
          <Reveal delay={400} style={{ marginTop: 12 }}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="scale" size={18} color={theme.colors.weight} />
                <AppText variant="cardTitle" style={{ fontSize: 16 }}>
                  Weight
                </AppText>
              </View>
              {view.weight ? (
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: theme.spacing.md }}>
                  <CountUp value={view.weight.value} variant="statBig" />
                  <AppText variant="caption" color="textSecondary">
                    {view.weight.unit}
                  </AppText>
                </View>
              ) : (
                <AppText variant="body" color="textSecondary" style={{ marginTop: theme.spacing.md }}>
                  Log your weight to track progress.
                </AppText>
              )}
            </Card>
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

const TASK_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
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
          <Ionicons name="sparkles" size={16} color={theme.colors.primary} />
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
              <Ionicons name={t.done ? 'checkmark' : TASK_ICON[t.key] ?? 'ellipse-outline'} size={15} color={t.done ? theme.colors.success : theme.colors.primary} />
            </View>
            <AppText
              variant="bodyStrong"
              style={{ flex: 1, fontWeight: t.done ? '500' : '700', color: t.done ? theme.colors.textTertiary : theme.colors.textPrimary, textDecorationLine: t.done ? 'line-through' : 'none' }}
            >
              {t.label}
            </AppText>
            {tappable ? <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} /> : null}
          </Pressable>
        );
      })}
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
    <Card style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        {icon}
        <AppText variant="cardTitle" style={{ fontSize: 15 }}>
          {title}
        </AppText>
      </View>
      <View style={{ alignItems: 'center', marginVertical: 10 }}>
        <ProgressRing size={104} pct={stat.pct} color={color}>
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

function EmptyCard({ icon, line }: { icon: React.ReactNode; line: string }) {
  const theme = useTheme();
  return (
    <Card style={{ alignItems: 'center', paddingVertical: theme.spacing['2xl'], gap: theme.spacing.md }}>
      <Mascot pose="idle" size={80} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon}
        <AppText variant="bodyStrong" color="textSecondary" align="center" style={{ flexShrink: 1 }}>
          {line}
        </AppText>
      </View>
    </Card>
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
      style={{ width: 30, height: 30, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surface, borderWidth: 0.5, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name={name} size={16} color={tint} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radii.pill, padding: 4 }}>
      {btn('remove', onMinus, theme.colors.textPrimary)}
      <AppText variant="caption" style={{ fontWeight: '700' }}>
        {label}
      </AppText>
      {btn('add', onPlus, color)}
    </View>
  );
}
