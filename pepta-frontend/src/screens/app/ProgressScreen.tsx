// Progress tab — the body-progress dashboard. Reads /progress (weights,
// measurements, photos, weekly muscle-retention) + the profile from /home (goal
// weight, height for BMI). Functional range toggle, animated weight chart + bars
// + rings, count-ups, pull-to-refresh, mascot states. Nothing faked.

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Icon } from "../../components/Icon";
import * as Haptics from 'expo-haptics';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import {
  AppText,
  Button,
  Card,
  CountUp,
  Mascot,
  ProgressBar,
  ProgressPhotoCapture,
  ProgressRing,
  Reveal,
  ScreenHeader,
  SectionErrorBanner,
  WeightChart,
} from '../../components';

import { ProgressScopeMenu } from '../../components/ProgressScopeMenu';
import { usePeptaData } from '../../context/PeptaDataContext';
import { eatingView, numbersView } from './progressNumbers';
import {
  scopePillLabel,
  type ProgressScopeKey,
} from './progressScope';
import {
  RANGE_DAYS,
  formatShortDate,
  mergeWeightsWithLatest,
  sortWeights,
  summary,
  weightSeries,
  type RangeKey,
  type RetentionTone,
} from './progressView';

/**
 * The scope pill in the app's vocabulary and the weight series' vocabulary are
 * not the same list — "Since you started" is All, and there is no 7d scope.
 * Mapped in one place rather than teaching weightSeries a second enum.
 */
const SCOPE_RANGE: Record<ProgressScopeKey, RangeKey> = {
  start: 'All',
  '30d': '30d',
  '90d': '90d',
  year: '1y',
};

export function ProgressScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavigationProp<Record<string, undefined>>>();
  const { home, track, progress, progressLoading, progressRefreshing, progressError, refreshProgress, refreshHome, refreshTrack } =
    usePeptaData();
  const [scope, setScope] = useState<ProgressScopeKey>('start');
  const [scopeOpen, setScopeOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  useEffect(() => {
    if (!progress) void refreshProgress();
    if (!home) void refreshHome();
    // Nutrition for the eating and numbers cards. /progress has none, and this
    // screen used never to need /track at all.
    if (!track) void refreshTrack();
  }, [progress, home, track, refreshProgress, refreshHome, refreshTrack]);

  const refreshAll = () =>
    Promise.all([refreshProgress(), refreshHome(), refreshTrack()]).then(() => undefined);

  if (!progress && progressError) {
    return (
      <Centered>
        <Mascot pose="idle" size={120} />
        <AppText variant="cardTitle" align="center" style={{ marginTop: theme.spacing.lg }}>
          Couldn’t load Progress
        </AppText>
        {progressError ? (
          <AppText variant="caption" color="textSecondary" align="center" style={{ marginTop: theme.spacing.sm, maxWidth: 300 }}>
            {progressError}
          </AppText>
        ) : null}
        <View style={{ marginTop: theme.spacing.xl, width: 200 }}>
          <Button label="Try again" onPress={refreshAll} loading={progressLoading} />
        </View>
      </Centered>
    );
  }

  if (!progress) {
    return (
      <Centered>
        <Mascot pose="idle" size={110} />
        <ActivityIndicator color={theme.colors.primary} style={{ marginTop: theme.spacing.lg }} />
      </Centered>
    );
  }

  const profile = home?.profile ?? null;
  const nowDate = new Date();
  const weights = mergeWeightsWithLatest(progress.weights, home?.latestWeight ?? null);
  const progressForView = { ...progress, weights };
  const s = summary(progressForView, profile);
  // Scope is the SCREEN's now, not the weight card's. The old toggle lived
  // inside that card and moved only its chart, so the rest of the screen sat
  // at "all time" while the user believed they had picked 30 days.
  const series = weightSeries(weights, SCOPE_RANGE[scope], nowDate);
  const sortedW = sortWeights(weights);
  const startDate = sortedW[0]?.datetime ?? null;
  const sectionErrors = { ...(progress.sectionErrors ?? {}), ...(home?.sectionErrors ?? {}) };
  const photos = [...progress.progressPhotos]
    .filter((p) => p.status !== 'deleted')
    .sort((a, b) => b.captureDate.localeCompare(a.captureDate))
    .slice(0, 3);
  // Nutrition lives on /track, not /progress — see progressNumbers for why
  // these two read a fixed 30-day window rather than the header scope.
  const eating = eatingView(track?.mealLogs, track?.proteinLogs, profile, nowDate);
  const thirtyAgo = sortedW.find(
    (w) => new Date(w.datetime).getTime() >= nowDate.getTime() - 31 * 86_400_000,
  );
  const numbers = numbersView({
    currentWeight: s.weight.current,
    weightUnit: s.weight.unit,
    weightThirtyDaysAgo: thirtyAgo?.value ?? null,
    height: profile?.height ?? null,
    heightUnit: profile?.heightUnit ?? 'in',
    eating,
    profile,
  });
  const everythingEmpty =
    weights.length === 0 && progress.measurements.length === 0 && photos.length === 0 && !s.retention;

  const pickScope = (next: ProgressScopeKey) => {
    setScope(next);
    // Still re-queries: the buttons this replaces used to filter an already
    // downloaded 30-day payload, so anything wider showed a month at best and
    // older logs looked deleted. The client-side cut stays as the display cut.
    void refreshProgress(RANGE_DAYS[SCOPE_RANGE[next]]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={progressRefreshing} onRefresh={refreshAll} tintColor={theme.colors.primary} />}
        >
          <ScreenHeader
            title="Progress"
            scopeLabel={scopePillLabel(scope, startDate)}
            onScopePress={() => setScopeOpen(true)}
            onAdjust={() => navigation.navigate('Account')}
          />

          <SectionErrorBanner errors={sectionErrors} style={{ marginTop: theme.spacing.md }} />

          {everythingEmpty ? (
            <Reveal delay={60} style={{ marginTop: theme.spacing.lg }}>
              <Card style={{ alignItems: 'center', paddingVertical: theme.spacing['2xl'], gap: theme.spacing.md }}>
                <Mascot pose="idle" size={96} />
                <AppText variant="cardTitle" align="center">
                  Your progress starts here
                </AppText>
                <AppText variant="body" color="textSecondary" align="center" style={{ maxWidth: 260 }}>
                  Log a weight from the + button and your trend, BMI, and muscle check-ins show up here.
                </AppText>
              </Card>
            </Reveal>
          ) : null}

          {/* weight trend */}
          {weights.length > 0 ? (
            <Reveal delay={60} style={{ marginTop: theme.spacing.lg }}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon name="scale" size={18} color={theme.colors.weight} />
                    <AppText variant="cardTitle" style={{ fontSize: 15 }}>
                      Weight ({s.weight.unit})
                    </AppText>
                  </View>
                  {/* The 7d/30d/90d/1y/All strip that sat here is now the
                      header pill: it governs the whole screen rather than one
                      chart, which is what someone picking a window means. */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => undefined);
                        navigation.navigate('WeightDetail');
                      }}
                      hitSlop={8}
                    >
                      <Icon name="chevron-forward" size={17} color={theme.colors.textTertiary} />
                    </Pressable>
                  </View>
                </View>
                <WeightChart key={scope} points={series} color={theme.colors.weight} unit={s.weight.unit} formatDate={formatShortDate} />
              </Card>
            </Reveal>
          ) : null}

          {/* to-goal + BMI + difference */}
          <Reveal delay={140} style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <Card style={{ flex: 1, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start' }}>
                <Icon name="target" size={16} color={theme.colors.weight} />
                <AppText variant="cardTitle" style={{ fontSize: 15 }}>
                  To goal
                </AppText>
              </View>
              <View style={{ marginVertical: 10 }}>
                <ProgressRing size={120} pct={s.weight.toGoalPct} color={theme.colors.weight}>
                  <View style={{ alignItems: 'center' }}>
                    <CountUp value={Math.round(s.weight.toGoalPct * 100)} format={(n) => `${Math.round(n)}%`} variant="statMedium" />
                    <AppText variant="caption" color="textTertiary" style={{ fontSize: 10 }}>
                      {s.weight.goalWeight ? `to ${s.weight.goalWeight} ${s.weight.unit}` : 'set a goal'}
                    </AppText>
                  </View>
                </ProgressRing>
              </View>
            </Card>

            <View style={{ flex: 1, gap: 12 }}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <Icon name="heart-pulse" size={16} color={theme.colors.primary} />
                  <AppText variant="cardTitle" style={{ fontSize: 15 }}>
                    BMI
                  </AppText>
                  <Icon name="information-circle-outline" size={14} color={theme.colors.textTertiary} />
                </View>
                {s.bmi ? (
                  <>
                    <CountUp value={s.bmi.value} format={(n) => n.toFixed(1)} variant="statBig" style={{ marginTop: 8 }} />
                    <AppText variant="caption" color="textSecondary" style={{ marginTop: 4 }}>
                      {s.bmi.category}
                    </AppText>
                  </>
                ) : (
                  <AppText variant="caption" color="textSecondary" style={{ marginTop: 8 }}>
                    Add your height
                  </AppText>
                )}
              </Card>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <Icon name="arrow-down-right" size={16} color={theme.colors.fiber} />
                  <AppText variant="cardTitle" style={{ fontSize: 15 }}>
                    Difference
                  </AppText>
                </View>
                {s.weight.difference != null ? (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 8 }}>
                      <AppText variant="statBig" style={{ color: s.weight.difference <= 0 ? theme.colors.fiber : theme.colors.textPrimary }}>
                        {s.weight.difference > 0 ? '+' : ''}
                        {s.weight.difference}
                      </AppText>
                      <AppText variant="caption" color="textSecondary">
                        {s.weight.unit}
                      </AppText>
                    </View>
                    <AppText variant="caption" color="textSecondary" style={{ marginTop: 4 }}>
                      {s.weight.start != null && startDate ? `From ${s.weight.start} · ${formatShortDate(startDate)}` : 'Since you started'}
                    </AppText>
                  </>
                ) : (
                  <AppText variant="caption" color="textSecondary" style={{ marginTop: 8 }}>
                    Log a weight
                  </AppText>
                )}
              </Card>
            </View>
          </Reveal>

          {/* muscle protection (weekly retention engine) */}
          {s.retention ? (
            <Reveal delay={220} style={{ marginTop: 12 }}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon name="shield-check" size={18} color={theme.colors.fiber} />
                    <AppText variant="cardTitle" style={{ fontSize: 15 }}>
                      Muscle protection
                    </AppText>
                    <Icon name="information-circle-outline" size={14} color={theme.colors.textTertiary} />
                  </View>
                  <Mascot pose="idle" size={32} />
                </View>
                <View style={{ marginTop: theme.spacing.md, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <VerdictPill tone={s.retention.tone} label={s.retention.label} />
                  <AppText variant="caption" color="textTertiary">
                    {s.retention.score}/100 this week
                  </AppText>
                </View>
                <AppText variant="body" color="textPrimary" style={{ marginTop: 10 }}>
                  {s.retention.prose}
                </AppText>
                <View style={{ marginTop: 14, gap: 10 }}>
                  {s.retention.drivers.map((d, i) => (
                    <View key={d.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <AppText variant="caption" color="textSecondary" style={{ width: 64 }}>
                        {d.label}
                      </AppText>
                      <View style={{ flex: 1 }}>
                        <ProgressBar pct={d.score / 100} color={toneColor(theme, s.retention!.tone)} delay={260 + i * 90} height={7} />
                      </View>
                    </View>
                  ))}
                </View>
              </Card>
            </Reveal>
          ) : null}

          {/* what you're eating — the frame's card, from /track's 30 days */}
          {eating ? (
            <Reveal delay={200} style={{ marginTop: 12 }}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Icon name="nutrition" size={18} color={theme.colors.protein} />
                  <AppText variant="cardTitle" style={{ fontSize: 15 }}>
                    What you’re eating
                  </AppText>
                </View>
                <View style={{ flexDirection: 'row', gap: 18, marginTop: 14 }}>
                  <BigStat
                    value={eating.caloriesPerDay?.toLocaleString() ?? '—'}
                    unit="cal"
                    note={eating.calorieTarget ? `a day · of ${eating.calorieTarget.toLocaleString()}` : 'a day'}
                  />
                  <BigStat
                    value={eating.proteinPerDay != null ? String(eating.proteinPerDay) : '—'}
                    unit="g"
                    note={eating.proteinTarget ? `protein · of ${eating.proteinTarget}` : 'protein'}
                  />
                </View>
                {/* One bar per day THEY LOGGED in the last week — a bar for a
                    day with no logs would read as a day they ate nothing. */}
                {eating.weekBars.length > 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 64, marginTop: 14 }}>
                    {eating.weekBars.map((bar) => {
                      const ceiling = Math.max(eating.proteinTarget ?? 0, ...eating.weekBars.map((b) => b.grams));
                      return (
                        <View
                          key={bar.day}
                          accessible
                          accessibilityLabel={`${bar.grams} g protein${bar.hit ? ', target hit' : ''}`}
                          style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}
                        >
                          <View
                            style={{
                              height: `${Math.max(6, ceiling > 0 ? (bar.grams / ceiling) * 100 : 0)}%`,
                              borderRadius: 6,
                              backgroundColor: bar.hit ? theme.colors.fiber : theme.colors.surfaceAlt,
                            }}
                          />
                        </View>
                      );
                    })}
                  </View>
                ) : null}
                {eating.proteinHitOf > 0 ? (
                  <AppText
                    variant="caption"
                    color="textSecondary"
                    style={{ marginTop: 10, paddingTop: 9, borderTopWidth: 0.5, borderTopColor: theme.colors.border }}
                  >
                    Protein target hit on {eating.proteinHitDays} of {eating.proteinHitOf} days this week
                  </AppText>
                ) : null}
              </Card>
            </Reveal>
          ) : null}

          {/* timeline */}
          {s.weight.goalWeight != null && s.weight.start != null ? (
            <Reveal delay={300} style={{ marginTop: 12 }}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon name="flag" size={18} color={theme.colors.weight} />
                    <AppText variant="cardTitle" style={{ fontSize: 15 }}>
                      Timeline
                    </AppText>
                  </View>
                  {s.estimatedGoalDate ? (
                    <AppText variant="caption" color="textSecondary" style={{ fontWeight: '700' }}>
                      Est. {formatShortDate(s.estimatedGoalDate)}
                    </AppText>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
                  <Milestone value={s.weight.start} label={startDate ? formatShortDate(startDate) : 'Start'} muted />
                  <Milestone value={s.weight.current ?? 0} label="Today" />
                  <Milestone value={s.weight.goalWeight} label="Goal" muted />
                </View>
                <View style={{ marginTop: 10 }}>
                  <ProgressBar pct={s.weight.toGoalPct} color={theme.colors.weight} delay={340} height={8} />
                </View>
              </Card>
            </Reveal>
          ) : null}

          {/* measurements */}
          {s.measurements.length > 0 ? (
            <Reveal delay={360} style={{ marginTop: 12 }}>
              <Card>
                <AppText variant="cardTitle" style={{ fontSize: 15 }}>
                  Measurements
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: theme.spacing.sm }}>
                  {s.measurements.map((m) => (
                    <View key={m.type} style={{ width: '50%', paddingVertical: 8 }}>
                      <AppText variant="caption" color="textSecondary">
                        {m.label}
                      </AppText>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                        <AppText variant="bodyStrong" style={{ fontWeight: '800' }}>
                          {m.value}
                        </AppText>
                        <AppText variant="caption" color="textTertiary">
                          {m.unit}
                        </AppText>
                      </View>
                    </View>
                  ))}
                </View>
              </Card>
            </Reveal>
          ) : null}


          {/* what your numbers say */}
          {numbers ? (
            <Reveal delay={340} style={{ marginTop: 12 }}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Icon name="chart-line" size={18} color={theme.colors.primary} />
                  <AppText variant="cardTitle" style={{ fontSize: 15 }}>
                    What your numbers say
                  </AppText>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  {numbers.stats.map((stat) => (
                    <View key={`${stat.value}${stat.unit}${stat.note}`} style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                        <AppText variant="bodyStrong" style={{ fontSize: 16, fontWeight: '700' }}>
                          {stat.value}
                        </AppText>
                        <AppText variant="caption" color="textTertiary" style={{ fontSize: 10, fontWeight: '600' }}>
                          {' '}{stat.unit}
                        </AppText>
                      </View>
                      <AppText variant="caption" color="textSecondary" style={{ fontSize: 10, marginTop: 3 }} numberOfLines={1}>
                        {stat.note}
                      </AppText>
                    </View>
                  ))}
                </View>
                {numbers.footer ? (
                  <AppText
                    variant="caption"
                    color="textSecondary"
                    style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: theme.colors.border, fontSize: 10.5, lineHeight: 15 }}
                  >
                    {numbers.footer}
                  </AppText>
                ) : null}
              </Card>
            </Reveal>
          ) : null}

          {/* progress photos */}
          <Reveal delay={420} style={{ marginTop: 12 }}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Icon name="camera" size={18} color={theme.colors.textSecondary} />
                  <AppText variant="cardTitle" style={{ fontSize: 15 }}>
                    Progress photos
                  </AppText>
                </View>
                <Pressable onPress={() => { Haptics.selectionAsync().catch(() => undefined); setPhotoOpen(true); }} hitSlop={8}>
                  <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
                    + Add
                  </AppText>
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: theme.spacing.md }}>
                {photos.map((p) => (
                  <View key={p.id} style={{ flex: 1, aspectRatio: 3 / 4, borderRadius: 12, backgroundColor: theme.colors.surfaceAlt, overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end' }}>
                    {p.viewUrl ? <Image source={{ uri: p.viewUrl }} style={{ position: 'absolute', width: '100%', height: '100%' }} /> : null}
                    <View style={{ width: '100%', paddingVertical: 3, backgroundColor: 'rgba(0,0,0,0.25)' }}>
                      <AppText variant="caption" align="center" style={{ fontSize: 10, color: '#fff' }}>
                        {formatShortDate(p.captureDate)}
                      </AppText>
                    </View>
                  </View>
                ))}
                {Array.from({ length: Math.max(1, 4 - photos.length) }).map((_, i) => (
                  <Pressable
                    key={`add-${i}`}
                    onPress={() => { Haptics.selectionAsync().catch(() => undefined); setPhotoOpen(true); }}
                    style={{ flex: 1, aspectRatio: 3 / 4, borderRadius: 12, borderWidth: 1.5, borderColor: theme.colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icon name="add" size={20} color={theme.colors.textTertiary} />
                  </Pressable>
                ))}
              </View>
            </Card>
          </Reveal>
        </ScrollView>
      </SafeAreaView>

      <ProgressScopeMenu
        visible={scopeOpen}
        scope={scope}
        startedAt={startDate}
        onPick={pickScope}
        onClose={() => setScopeOpen(false)}
      />

      <ProgressPhotoCapture
        visible={photoOpen}
        onClose={() => setPhotoOpen(false)}
        onSaved={refreshProgress}
        recentPhotos={photos}
      />
    </View>
  );
}

function toneColor(theme: ReturnType<typeof useTheme>, tone: RetentionTone): string {
  return tone === 'bad' ? theme.colors.danger : tone === 'warn' ? theme.colors.warning : theme.colors.success;
}

function VerdictPill({ tone, label }: { tone: RetentionTone; label: string }) {
  const theme = useTheme();
  const color = toneColor(theme, tone);
  const bg = tone === 'bad' ? '#FDECEC' : tone === 'warn' ? '#FFF6E6' : '#E8F8EE';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: bg, paddingVertical: 4, paddingHorizontal: 10, borderRadius: theme.radii.pill }}>
      <Icon name="checkmark-circle" size={13} color={color} />
      <AppText variant="caption" style={{ color, fontWeight: '700' }}>
        {label}
      </AppText>
    </View>
  );
}

function Milestone({ value, label, muted }: { value: number; label: string; muted?: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <AppText variant={muted ? 'body' : 'statMedium'} color={muted ? 'textSecondary' : 'textPrimary'} style={muted ? { fontWeight: '700' } : undefined}>
        {value}
      </AppText>
      <AppText variant="caption" color="textTertiary" style={{ fontSize: 10 }}>
        {label}
      </AppText>
    </View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing['2xl'] }}>
        {children}
      </SafeAreaView>
    </View>
  );
}

/** The frame's big-number-with-unit, used by both new cards. */
function BigStat({ value, unit, note }: { value: string; unit: string; note: string }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <AppText variant="statMedium" style={{ fontSize: 22 }}>
          {value}
        </AppText>
        <AppText variant="caption" color="textSecondary" style={{ fontSize: 12, fontWeight: '700' }}>
          {' '}{unit}
        </AppText>
      </View>
      <AppText variant="caption" color="textSecondary" style={{ marginTop: 5 }}>
        {note}
      </AppText>
    </View>
  );
}
