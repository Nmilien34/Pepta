// Protocol dose-timing editor (competitor-review ask) — opened from Dose
// settings' "Reminder time" row, which previously just opened the log sheet.
// Times are the user's own wall-clock choices (up to 3 = split dosing, e.g.
// BPC-157 morning + evening) plus their timing context. USER-SET only: the
// copy never suggests an "optimal" time — Pepta executes the protocol the
// user already has. Saving PATCHes the schedule; the backend re-projects
// nextDoseAt from these times, which retimes the Track countdown and dose
// reminders automatically.

import { MASK_PROPS } from "./MaskedHealthValue";
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Icon } from './Icon';
import { SegmentedToggle } from './onboarding/SegmentedToggle';
import { useTheme } from '../theme';
import { usePeptaData } from '../context/PeptaDataContext';
import { api } from '../services/api';
import {
  defaultTimesFor,
  formatTimeOfDay,
  primarySchedule,
  stepTime,
  TIMING_OPTIONS,
  type ScheduleTiming,
} from '../screens/app/timingView';

const MAX_TIMES = 3;
const STEP_MINUTES = 30;

interface TimingSheetProps {
  visible: boolean;
  onClose(): void;
  onDismissed?: () => void;
}

export function TimingSheet({ visible, onClose, onDismissed }: TimingSheetProps) {
  const theme = useTheme();
  const { home, schedules, refreshScheduling, refreshHome } = usePeptaData();
  const schedule = primarySchedule(schedules);
  const compoundName =
    home?.activeCompounds.find((c) => c.id === schedule?.compoundId)?.name ??
    home?.activeCompounds[0]?.name ??
    'your medication';

  const [times, setTimes] = useState<string[]>(['08:00']);
  const [timing, setTiming] = useState<ScheduleTiming>('anytime');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  // Re-seed from the schedule each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setTimes(defaultTimesFor(schedule));
      setTiming(schedule?.timing ?? 'anytime');
      setSaving(false);
      setError(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const bump = (index: number, deltaMinutes: number) => {
    Haptics.selectionAsync().catch(() => undefined);
    setTimes((current) =>
      current.map((time, i) => (i === index ? stepTime(time, deltaMinutes) : time)),
    );
  };

  const addTime = () => {
    if (times.length >= MAX_TIMES) return;
    Haptics.selectionAsync().catch(() => undefined);
    // Seed the new slot 12h from the first time — the split-dose convention.
    setTimes((current) => [...current, stepTime(current[0] ?? '08:00', 720)]);
  };

  const removeTime = (index: number) => {
    Haptics.selectionAsync().catch(() => undefined);
    setTimes((current) => current.filter((_, i) => i !== index));
  };

  const onSave = async () => {
    if (!schedule || saving) return;
    setSaving(true);
    setError(false);
    try {
      await api.updateSchedule(schedule.id, {
        timesOfDay: [...times].sort(),
        timing,
      });
      // nextDoseAt re-projects from the new times — refresh both surfaces.
      await Promise.allSettled([refreshScheduling(), refreshHome()]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      onClose();
    } catch {
      setError(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      setSaving(false);
    }
  };

  return (
    <BottomSheet panelProps={MASK_PROPS} visible={visible} onClose={onClose} onDismissed={onDismissed} avoidKeyboard={false}>
      <AppText variant="cardTitle" style={{ fontSize: 17 }}>
        Dose timing
      </AppText>
      <AppText variant="caption" color="textSecondary" style={{ marginTop: 3 }}>
        {compoundName} · your protocol, your times
      </AppText>

      {!schedule ? (
        <AppText variant="body" color="textSecondary" style={{ marginTop: 16, marginBottom: 8 }}>
          Set up your dose schedule first — log a shot and Pepta will build it.
        </AppText>
      ) : (
        <>
          {times.map((time, index) => (
            <View
              key={index}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 12,
                borderBottomWidth: index < times.length - 1 ? 0.5 : 0,
                borderBottomColor: theme.colors.border,
                marginTop: index === 0 ? 8 : 0,
              }}
            >
              <AppText variant="statMedium" style={{ fontSize: 22 }}>
                {formatTimeOfDay(time)}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <StepBtn icon="remove" label="Earlier" onPress={() => bump(index, -STEP_MINUTES)} />
                <StepBtn icon="add" label="Later" onPress={() => bump(index, STEP_MINUTES)} />
                {times.length > 1 ? (
                  <Pressable
                    onPress={() => removeTime(index)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${formatTimeOfDay(time)}`}
                    style={{ marginLeft: 4 }}
                  >
                    <Icon name="close" size={16} color={theme.colors.textTertiary} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}

          {times.length < MAX_TIMES ? (
            <Pressable
              onPress={addTime}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Add another time"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 10 }}
            >
              <Icon name="add" size={14} color={theme.colors.primary} />
              <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
                Add another time
              </AppText>
            </Pressable>
          ) : null}

          <AppText
            variant="sectionHeader"
            color="textTertiary"
            style={{ textTransform: 'uppercase', marginTop: 14 }}
          >
            Timing
          </AppText>
          <View style={{ marginTop: 10, alignSelf: 'flex-start' }}>
            <SegmentedToggle
              compact
              options={TIMING_OPTIONS}
              value={timing}
              onChange={(value) => setTiming(value)}
            />
          </View>

          {error ? (
            <AppText variant="caption" style={{ marginTop: 12, color: theme.colors.danger }}>
              Couldn’t save your timing — check your connection and try again.
            </AppText>
          ) : null}

          <View style={{ marginTop: 18 }}>
            <Button label="Save timing" onPress={() => void onSave()} loading={saving} fullWidth />
          </View>
        </>
      )}
    </BottomSheet>
  );
}

function StepBtn({ icon, label, onPress }: { icon: string; label: string; onPress(): void }) {
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
