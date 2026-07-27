import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card, SectionErrorBanner } from '../../components';
import { Icon } from '../../components/Icon';
import { TimingSheet } from '../../components/TimingSheet';
import { useLogSheets } from '../../context/LogSheetsContext';
import { usePeptaData } from '../../context/PeptaDataContext';
import { useTheme } from '../../theme';
import { formatNextDoseAt, siteLabel, sortDoses } from './trackView';
import { activeCycleOf, patternOf } from './scheduleView';
import { formatTimesOfDay, primarySchedule, timingLabel } from './timingView';

export function DoseSettingsScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NavigationProp<Record<string, undefined>>>();
  const { openQuickLog } = useLogSheets();
  const { home, track, homeLoading, trackLoading, homeError, trackError, refreshHome, refreshTrack, schedules, cycles, refreshScheduling } = usePeptaData();
  const [timingOpen, setTimingOpen] = useState(false);

  useEffect(() => {
    if (!home) void refreshHome();
    if (!track) void refreshTrack();
    if (!cycles) void refreshScheduling();
  }, [home, track, cycles, refreshHome, refreshTrack, refreshScheduling]);

  const cyclePattern = useMemo(() => patternOf(activeCycleOf(cycles)), [cycles]);
  const schedule = useMemo(() => primarySchedule(schedules), [schedules]);
  const timingValue = useMemo(() => {
    if (schedule?.timesOfDay && schedule.timesOfDay.length > 0) {
      const context = timingLabel(schedule.timing);
      return `${formatTimesOfDay(schedule.timesOfDay)}${context ? ` · ${context}` : ''}`;
    }
    return null;
  }, [schedule]);

  const compound = home?.activeCompounds[0] ?? null;
  const ml = home?.medicationLevels[0] ?? null;
  const lastDose = sortDoses(track?.doseLogs ?? [])[0] ?? null;
  const nextDose = home?.nextDose ?? null;
  const loading = (homeLoading || trackLoading) && !home && !track;
  const sectionErrors = { ...(home?.sectionErrors ?? {}), ...(track?.sectionErrors ?? {}) };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
          <DetailHeader title="Dose Settings" onBack={() => navigation.goBack()} />
          <SectionErrorBanner errors={sectionErrors} style={{ marginTop: theme.spacing.md }} />

          {loading ? (
            <View style={{ paddingTop: 80, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (
            <>
              {homeError || trackError ? (
                <Card style={{ marginTop: theme.spacing.lg }}>
                  <AppText variant="bodyStrong" style={{ fontWeight: '800' }}>
                    Some dose data did not load
                  </AppText>
                  <AppText variant="caption" color="textSecondary" style={{ marginTop: 6 }}>
                    {homeError ?? trackError}
                  </AppText>
                </Card>
              ) : null}

              <Card style={{ marginTop: theme.spacing.lg }}>
                <SettingRow
                  icon="needle"
                  label="Medication"
                  value={compound?.name ?? ml?.compoundName ?? 'Add medication'}
                  onPress={() => openQuickLog('dose')}
                />
                <SettingRow
                  icon="calendar-week"
                  label="Schedule"
                  value={nextDose?.nextDoseAt ? formatNextDoseAt(nextDose.nextDoseAt) : compound ? 'No upcoming dose' : 'Set with first shot'}
                  onPress={() => openQuickLog('dose')}
                />
                <SettingRow
                  icon="flask"
                  label="Dosage"
                  value={compound?.plannedDose ? `${compound.plannedDose} ${compound.doseUnit}` : lastDose ? `${lastDose.amount} ${lastDose.unit}` : 'Not set'}
                  onPress={() => openQuickLog('dose')}
                />
                <SettingRow
                  icon="current-location"
                  label="Location"
                  value={lastDose?.injectionSite ? siteLabel(lastDose.injectionSite) : 'Choose when logging'}
                  onPress={() => openQuickLog('dose')}
                />
                <SettingRow
                  icon="time-outline"
                  label="Dose timing"
                  value={
                    timingValue ??
                    (nextDose?.nextDoseAt ? formatTime(nextDose.nextDoseAt) : 'Set your times')
                  }
                  onPress={() => setTimingOpen(true)}
                />
                <SettingRow
                  icon="repeat"
                  label="Cycle"
                  value={cyclePattern ? `${cyclePattern.weeksOn} wk on, ${cyclePattern.weeksOff} off` : 'Not set'}
                  onPress={() => navigation.navigate('CycleSetup')}
                />
                <SettingRow
                  icon="flask"
                  label="Mix calculator"
                  value="Vial + water → units"
                  last
                  onPress={() => navigation.navigate('MixCalculator')}
                />
              </Card>

              <Card style={{ marginTop: 12, backgroundColor: '#EFEBFF' }} flat>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <View style={{ width: 38, height: 38, borderRadius: 16, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="bolt" size={19} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" style={{ fontWeight: '800' }}>
                      Keep it simple
                    </AppText>
                    <AppText variant="caption" color="textSecondary" style={{ marginTop: 4, lineHeight: 17 }}>
                      Logging a shot updates dose history, injection site rotation, and your medication-level estimate.
                    </AppText>
                  </View>
                </View>
                <View style={{ marginTop: 14 }}>
                  <Button label="Log dose" onPress={() => openQuickLog('dose')} />
                </View>
              </Card>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
      <TimingSheet visible={timingOpen} onClose={() => setTimingOpen(false)} />
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

function SettingRow({
  icon,
  label,
  value,
  last,
  onPress,
}: {
  icon: string;
  label: string;
  value: string;
  last?: boolean;
  onPress(): void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        paddingVertical: 15,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: theme.colors.border,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Icon name={icon} size={22} color={theme.colors.primary} />
      <AppText variant="bodyStrong" style={{ flex: 1, fontWeight: '800' }}>
        {label}
      </AppText>
      <AppText variant="bodyStrong" color="textSecondary" style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </AppText>
      <Icon name="chevron-forward" size={17} color={theme.colors.textTertiary} />
    </Pressable>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'No reminder yet';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}
