import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card, ProgressBar, SectionErrorBanner, WeightChart } from '../../components';
import { Icon } from '../../components/Icon';
import { useLogSheets } from '../../context/LogSheetsContext';
import { usePeptaData } from '../../context/PeptaDataContext';
import { useTheme } from '../../theme';
import {
  RANGE_KEYS,
  formatShortDate,
  mergeWeightsWithLatest,
  sortWeights,
  summary,
  weightSeries,
  type RangeKey,
} from './progressView';

export function WeightDetailScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { openQuickLog } = useLogSheets();
  const { home, progress, homeLoading, progressLoading, homeError, progressError, refreshHome, refreshProgress } = usePeptaData();
  const [range, setRange] = useState<RangeKey>('90d');

  useEffect(() => {
    if (!home) void refreshHome();
    if (!progress) void refreshProgress();
  }, [home, progress, refreshHome, refreshProgress]);

  const loading = (homeLoading || progressLoading) && !home && !progress;
  const weights = mergeWeightsWithLatest(progress?.weights ?? [], home?.latestWeight ?? null);
  const profile = home?.profile ?? null;
  const sorted = sortWeights(weights);
  const s = progress ? summary({ ...progress, weights }, profile) : null;
  const series = weightSeries(weights, range, new Date());
  const start = sorted[0] ?? null;
  const current = sorted[sorted.length - 1] ?? home?.latestWeight ?? null;
  const sectionErrors = { ...(home?.sectionErrors ?? {}), ...(progress?.sectionErrors ?? {}) };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
          <DetailHeader title="Weight" onBack={() => navigation.goBack()} />
          <SectionErrorBanner errors={sectionErrors} style={{ marginTop: theme.spacing.md }} />

          {loading ? (
            <View style={{ paddingTop: 80, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors.weight} />
            </View>
          ) : (
            <>
              {homeError || progressError ? (
                <Card style={{ marginTop: theme.spacing.lg }}>
                  <AppText variant="bodyStrong" style={{ fontWeight: '800' }}>
                    Some weight data did not load
                  </AppText>
                  <AppText variant="caption" color="textSecondary" style={{ marginTop: 6 }}>
                    {homeError ?? progressError}
                  </AppText>
                </Card>
              ) : null}

              <Card style={{ marginTop: theme.spacing.lg }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon name="scale" size={18} color={theme.colors.weight} />
                    <AppText variant="cardTitle" style={{ fontSize: 15 }}>
                      Weight ({s?.weight.unit ?? profile?.weightUnit ?? 'lb'})
                    </AppText>
                  </View>
                  <RangePicker value={range} onChange={setRange} />
                </View>
                {series.length > 0 ? (
                  <WeightChart points={series} color={theme.colors.weight} unit={s?.weight.unit ?? profile?.weightUnit ?? 'lb'} formatDate={formatShortDate} />
                ) : (
                  <View style={{ paddingVertical: 34, alignItems: 'center' }}>
                    <AppText variant="bodyStrong" color="textSecondary">
                      No weight entries yet
                    </AppText>
                    <AppText variant="caption" color="textTertiary" style={{ marginTop: 5 }}>
                      Log one from here and your trend starts.
                    </AppText>
                  </View>
                )}
              </Card>

              {s?.weight.goalWeight != null && s.weight.start != null ? (
                <Card style={{ marginTop: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Icon name="flag" size={18} color={theme.colors.weight} />
                      <AppText variant="cardTitle" style={{ fontSize: 16 }}>
                        Timeline
                      </AppText>
                    </View>
                    {s.estimatedGoalDate ? (
                      <View style={{ backgroundColor: theme.colors.surfaceAlt, paddingVertical: 5, paddingHorizontal: 11, borderRadius: theme.radii.pill }}>
                        <AppText variant="caption" color="textSecondary" style={{ fontWeight: '800' }}>
                          Est. {formatShortDate(s.estimatedGoalDate)}
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 }}>
                    <Milestone value={s.weight.start} label={start ? formatShortDate(start.datetime) : 'Start'} muted />
                    <Milestone value={s.weight.current ?? 0} label="Today" />
                    <Milestone value={s.weight.goalWeight} label="Goal" muted />
                  </View>
                  <View style={{ marginTop: 12 }}>
                    <ProgressBar pct={s.weight.toGoalPct} color={theme.colors.weight} height={8} />
                  </View>
                </Card>
              ) : null}

              <Card style={{ marginTop: 12 }}>
                <SettingRow icon="calendar" label="Start Date" value={profile?.journeyStartDate ? formatShortDate(profile.journeyStartDate) : start ? formatShortDate(start.datetime) : 'Not set'} />
                <SettingRow icon="scale" label="Start Weight" value={s?.weight.start != null ? `${s.weight.start}${s.weight.unit}` : 'Not set'} />
                <SettingRow icon="scale" label="Current Weight" value={current ? `${current.value}${current.unit}` : 'Not logged'} />
                <SettingRow icon="resize" label="Height" value={profile?.height ? `${profile.height}${profile.heightUnit}` : 'Not set'} />
                <SettingRow icon="flag" label="Goal Weight" value={profile?.goalWeight ? `${profile.goalWeight}${profile.goalWeightUnit ?? profile.weightUnit}` : 'Not set'} />
                <SettingRow icon="walk" label="Weight Loss Pace" value={paceLabel(profile?.goalPace)} last />
              </Card>

              <View style={{ marginTop: 14 }}>
                <Button label="Log weight" onPress={() => openQuickLog('weight')} />
              </View>
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

function RangePicker({ value, onChange }: { value: RangeKey; onChange(value: RangeKey): void }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radii.pill, padding: 3 }}>
      {RANGE_KEYS.filter((item) => item !== 'All').map((r) => {
        const active = r === value;
        return (
          <Pressable
            key={r}
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              onChange(r);
            }}
            style={[
              { paddingVertical: 5, paddingHorizontal: 9, borderRadius: theme.radii.pill },
              active ? { backgroundColor: theme.colors.surface, ...theme.shadows.card } : null,
            ]}
          >
            <AppText variant="caption" color={active ? 'textPrimary' : 'textSecondary'} style={{ fontWeight: '800', fontSize: 11 }}>
              {r}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function Milestone({ value, label, muted }: { value: number; label: string; muted?: boolean }) {
  return (
    <View style={{ alignItems: muted ? 'flex-start' : 'center' }}>
      <AppText variant="cardTitle" color={muted ? 'textSecondary' : 'textPrimary'} style={{ fontSize: 17 }}>
        {value}lbs
      </AppText>
      <AppText variant="caption" color="textTertiary" style={{ marginTop: 5 }}>
        {label}
      </AppText>
    </View>
  );
}

function SettingRow({ icon, label, value, last }: { icon: string; label: string; value: string; last?: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: theme.colors.border }}>
      <Icon name={icon} size={21} color={label.includes('Goal') || label.includes('Current') ? theme.colors.weight : theme.colors.textPrimary} />
      <AppText variant="bodyStrong" style={{ flex: 1, fontWeight: '800' }}>
        {label}
      </AppText>
      <AppText variant="bodyStrong" color="textSecondary" style={{ textAlign: 'right' }}>
        {value}
      </AppText>
      <Icon name="chevron-forward" size={17} color={theme.colors.textTertiary} />
    </View>
  );
}

function paceLabel(value: string | undefined): string {
  if (value === 'gentle') return 'Gentle';
  if (value === 'ambitious') return 'Ambitious';
  if (value === 'steady') return 'Steady';
  return 'Not set';
}
