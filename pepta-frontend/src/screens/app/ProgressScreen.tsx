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

import { usePeptaData } from '../../context/PeptaDataContext';
import {
  RANGE_KEYS,
  formatShortDate,
  mergeWeightsWithLatest,
  sortWeights,
  summary,
  weightSeries,
  type RangeKey,
  type RetentionTone,
} from './progressView';

export function ProgressScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavigationProp<Record<string, undefined>>>();
  const { home, progress, progressLoading, progressRefreshing, progressError, refreshProgress, refreshHome } =
    usePeptaData();
  const [range, setRange] = useState<RangeKey>('90d');
  const [photoOpen, setPhotoOpen] = useState(false);

  useEffect(() => {
    if (!progress) void refreshProgress();
    if (!home) void refreshHome();
  }, [progress, home, refreshProgress, refreshHome]);

  const refreshAll = () => Promise.all([refreshProgress(), refreshHome()]).then(() => undefined);

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
  const series = weightSeries(weights, range, nowDate);
  const sortedW = sortWeights(weights);
  const startDate = sortedW[0]?.datetime ?? null;
  const sectionErrors = { ...(progress.sectionErrors ?? {}), ...(home?.sectionErrors ?? {}) };
  const photos = [...progress.progressPhotos]
    .filter((p) => p.status !== 'deleted')
    .sort((a, b) => b.captureDate.localeCompare(a.captureDate))
    .slice(0, 3);
  const everythingEmpty =
    weights.length === 0 && progress.measurements.length === 0 && photos.length === 0 && !s.retention;

  const pickRange = (r: RangeKey) => {
    Haptics.selectionAsync().catch(() => undefined);
    setRange(r);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={progressRefreshing} onRefresh={refreshAll} tintColor={theme.colors.primary} />}
        >
          <ScreenHeader title="Progress" onAdjust={() => navigation.navigate('Account')} />

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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <View style={{ flexDirection: 'row', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radii.pill, padding: 3 }}>
                      {RANGE_KEYS.map((r) => {
                        const active = r === range;
                        return (
                          <Pressable
                            key={r}
                            onPress={() => pickRange(r)}
                            style={[{ paddingVertical: 5, paddingHorizontal: 9, borderRadius: theme.radii.pill }, active ? { backgroundColor: theme.colors.surface, ...theme.shadows.card } : null]}
                          >
                            <AppText variant="caption" color={active ? 'textPrimary' : 'textSecondary'} style={{ fontWeight: '700', fontSize: 11 }}>
                              {r}
                            </AppText>
                          </Pressable>
                        );
                      })}
                    </View>
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
                <WeightChart key={range} points={series} color={theme.colors.weight} unit={s.weight.unit} formatDate={formatShortDate} />
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
                  <View style={{ width: 34, height: 34, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <Mascot pose="idle" size={26} />
                  </View>
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
