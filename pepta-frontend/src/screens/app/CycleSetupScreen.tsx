// Cycle setup — the review ask verbatim: "8 weeks on, 2 weeks off, repeat".
// Opened from the Track cycle pill, the month sheet's Edit row, and Dose
// settings. Steppers + segmented toggle are the shipped component idioms; the
// pattern preview derives every date from cycleWindows, the same math the
// calendar band and reminder pausing use.
//
// The cycles API has no PATCH, so saving replaces the active cycle
// (create-then-soft-delete via context.saveCycle).

import { MASK_PROPS } from "../../components/MaskedHealthValue";
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Card } from '../../components';
import { Icon } from '../../components/Icon';
import { SegmentedToggle } from '../../components/onboarding/SegmentedToggle';
import { usePeptaData } from '../../context/PeptaDataContext';
import { useTheme } from '../../theme';
import { activeCycleOf, patternOf, plannedDays } from './scheduleView';
import { cycleDayStatus, localDateOnly, type CyclePattern } from '../../utils/cycleWindows';

const MIN_WEEKS = 1;
const MAX_WEEKS = 52;

function shortDate(dateOnly: string): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function addDays(dateOnly: string, days: number): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

export function CycleSetupScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { home, schedules, cycles, saveCycle } = usePeptaData();

  const existing = useMemo(() => activeCycleOf(cycles), [cycles]);
  const existingPattern = useMemo(() => patternOf(existing), [existing]);

  const [weeksOn, setWeeksOn] = useState(existingPattern?.weeksOn ?? 8);
  const [weeksOff, setWeeksOff] = useState(existingPattern?.weeksOff ?? 2);
  const [repeats, setRepeats] = useState(existingPattern?.repeats ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = localDateOnly(new Date());
  const startDate = existing?.startDate ?? today;
  const draft: CyclePattern = { startDate, weeksOn, weeksOff, repeats };

  // Next rest window relative to today (current one when already resting).
  const preview = useMemo(() => {
    const status = cycleDayStatus(draft, today);
    const restStart =
      status.phase === 'rest' ? status.phaseStart
      : status.phase === 'on' ? status.nextPhaseStart
      : status.phase === 'upcoming' ? addDays(startDate, weeksOn * 7)
      : null;
    if (!restStart) return null;
    const restEnd = addDays(restStart, weeksOff * 7 - 1);
    const backOn = repeats || status.phase !== 'rest' ? addDays(restEnd, 1) : null;
    // Last planned dose before the rest window; falls back to the last on-day.
    const planned = plannedDays(schedules, addDays(restStart, -weeksOn * 7), addDays(restStart, -1));
    const lastDose = [...planned].sort().pop() ?? addDays(restStart, -1);
    return { restStart, restEnd, backOn, lastDose };
  }, [draft, today, startDate, weeksOn, weeksOff, repeats, schedules]);

  const compoundIds = existing?.compoundIds ?? (home?.activeCompounds ?? []).map((c) => c.id);
  const canSave = compoundIds.length > 0 && !saving;

  const bump = (setter: (fn: (v: number) => number) => void, delta: number) => {
    Haptics.selectionAsync().catch(() => undefined);
    setter((v) => Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, v + delta)));
  };

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await saveCycle(
        {
          name: existing?.name ?? 'My cycle',
          compoundIds,
          startDate,
          ...(existing?.endDate ? { endDate: existing.endDate } : {}),
          ...(existing?.notes ? { notes: existing.notes } : {}),
          weeksOn,
          weeksOff,
          repeats,
        },
        existing?.id,
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      navigation.goBack();
    } catch {
      setError('Couldn’t save your cycle — check your connection and try again.');
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView {...MASK_PROPS} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
          {/* header — back chevron, title, Save link (design: Cycle setup frame) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
            <Pressable
              onPress={() => { Haptics.selectionAsync().catch(() => undefined); navigation.goBack(); }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="chevron-back" size={25} color={theme.colors.textSecondary} stroke={2.4} />
            </Pressable>
            <AppText variant="screenTitle" style={{ fontSize: 24 }}>
              Cycle
            </AppText>
            <Pressable onPress={onSave} hitSlop={10} disabled={!canSave} accessibilityRole="button" accessibilityLabel="Save cycle">
              <AppText variant="caption" color="primary" style={{ fontWeight: '700', opacity: canSave ? 1 : 0.4 }}>
                Save
              </AppText>
            </Pressable>
          </View>

          {/* weeks on */}
          <Card style={{ marginTop: theme.spacing.lg }}>
            <AppText variant="sectionHeader" color="textTertiary" style={{ textTransform: 'uppercase' }}>
              Weeks on
            </AppText>
            <WeekStepper
              value={weeksOn}
              onMinus={() => bump(setWeeksOn, -1)}
              onPlus={() => bump(setWeeksOn, 1)}
            />
          </Card>

          {/* then rest */}
          <Card style={{ marginTop: 12 }}>
            <AppText variant="sectionHeader" color="textTertiary" style={{ textTransform: 'uppercase' }}>
              Then rest
            </AppText>
            <WeekStepper
              value={weeksOff}
              onMinus={() => bump(setWeeksOff, -1)}
              onPlus={() => bump(setWeeksOff, 1)}
            />
            <View style={{ marginTop: 12, alignSelf: 'flex-start' }}>
              <SegmentedToggle
                compact
                options={[
                  { label: 'Repeat', value: 'repeat' },
                  { label: 'One cycle only', value: 'once' },
                ]}
                value={repeats ? 'repeat' : 'once'}
                onChange={(value) => setRepeats(value === 'repeat')}
              />
            </View>
          </Card>

          {/* pattern preview */}
          <Card style={{ marginTop: 12 }}>
            <AppText variant="sectionHeader" color="textTertiary" style={{ textTransform: 'uppercase' }}>
              Your pattern
            </AppText>
            <View style={{ flexDirection: 'row', height: 8, borderRadius: 99, overflow: 'hidden', marginTop: 12 }}>
              <PatternOn flex={weeksOn} />
              <View style={{ flex: weeksOff, backgroundColor: 'rgba(52,199,89,0.35)' }} />
              {repeats ? (
                <>
                  <PatternOn flex={weeksOn} />
                  <View style={{ flex: weeksOff, backgroundColor: 'rgba(52,199,89,0.35)' }} />
                </>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <AppText variant="caption" color="textSecondary" style={{ fontSize: 11 }}>
                {shortDate(startDate)} start
              </AppText>
              {preview ? (
                <AppText variant="caption" color="textSecondary" style={{ fontSize: 11 }}>
                  rest {shortDate(preview.restStart)} – {shortDate(preview.restEnd)}
                </AppText>
              ) : null}
            </View>
            {preview ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, marginTop: 8, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border }}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" style={{ fontWeight: '700' }}>
                      Last dose
                    </AppText>
                    <AppText variant="caption" color="textSecondary">
                      Reminders pause after it
                    </AppText>
                  </View>
                  <AppText variant="bodyStrong" style={{ fontWeight: '700' }}>
                    {shortDate(preview.lastDose)}
                  </AppText>
                </View>
                {preview.backOn ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyStrong" style={{ fontWeight: '700' }}>
                        Back on
                      </AppText>
                      <AppText variant="caption" color="textSecondary">
                        We’ll nudge you the day before
                      </AppText>
                    </View>
                    <AppText variant="bodyStrong" style={{ fontWeight: '700' }}>
                      {shortDate(preview.backOn)}
                    </AppText>
                  </View>
                ) : null}
              </>
            ) : null}
          </Card>

          {compoundIds.length === 0 ? (
            <AppText variant="caption" color="textSecondary" style={{ marginTop: 12, textAlign: 'center' }}>
              Add a medication first — the cycle applies to your compounds.
            </AppText>
          ) : null}
          {error ? (
            <AppText variant="caption" style={{ marginTop: 12, textAlign: 'center', color: theme.colors.danger }}>
              {error}
            </AppText>
          ) : null}

          <View style={{ marginTop: theme.spacing.lg, marginBottom: 30 }}>
            <Button label="Save cycle" onPress={onSave} disabled={!canSave} loading={saving} fullWidth />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// On-phase segment of the pattern bar — the hub's g1→g2 primary gradient,
// same tokens the primary Button uses.
function PatternOn({ flex }: { flex: number }) {
  const theme = useTheme();
  return (
    <LinearGradient
      colors={[theme.colors.primaryGradientStart, theme.colors.primaryGradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0.85 }}
      style={{ flex }}
    />
  );
}

// The hub `.stepper` idiom: pill track, 30px round buttons, bold center value.
function WeekStepper({ value, onMinus, onPlus }: { value: number; onMinus(): void; onPlus(): void }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: theme.colors.surfaceAlt,
        borderRadius: 999,
        padding: 4,
        marginTop: 14,
      }}
    >
      <StepBtn icon="remove" onPress={onMinus} label="Fewer weeks" />
      <AppText variant="bodyStrong" style={{ fontWeight: '700', fontSize: 13 }}>
        {value} {value === 1 ? 'week' : 'weeks'}
      </AppText>
      <StepBtn icon="add" onPress={onPlus} label="More weeks" />
    </View>
  );
}

function StepBtn({ icon, onPress, label }: { icon: string; onPress(): void; label: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 30,
        height: 30,
        borderRadius: 999,
        backgroundColor: theme.colors.surface,
        borderWidth: 0.5,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
        ...theme.shadows.soft,
      })}
    >
      <Icon name={icon} size={16} color={theme.colors.textPrimary} />
    </Pressable>
  );
}
