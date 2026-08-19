// Month schedule sheet — opened by tapping the Next-dose card on Track.
// Reuses the app BottomSheet (grab handle, dim backdrop, slide-out). The
// design-lab frame: month header with chevrons, Monday-start grid, purple
// due dots / green logged dots, the off-cycle rest window as one continuous
// green band rounded at its ends, a day-detail card for the selected day,
// and a cycle row ("Cycle · 8 wk on, 2 off — Edit").
//
// All rest/due/logged truth comes from scheduleView + cycleWindows, the same
// functions the Track strip uses — the two surfaces can never disagree.

import React, { useEffect, useMemo, useState } from 'react';
import { capitalize, globalDoseNoun } from '../screens/app/levelSuppression';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';
import { useTheme } from '../theme';
import { usePeptaData } from '../context/PeptaDataContext';
import {
  activeCycleOf,
  isLastDoseOfCycle,
  loggedDays,
  markForDay,
  type DayMark,
  patternOf,
  plannedDays,
} from '../screens/app/scheduleView';
import { formatDoseAmount } from '../screens/app/trackView';
import { formatTimesOfDay, timingLabel } from '../screens/app/timingView';
import {
  cycleDayStatus,
  isRestDay,
  localDateOnly,
} from '../utils/cycleWindows';

const REST_BG = 'rgba(52,199,89,0.09)';
const CELL_HEIGHT = 36;

interface ScheduleSheetProps {
  visible: boolean;
  onClose(): void;
  /** "Edit" on the cycle row. Parent closes the sheet and navigates onDismissed. */
  onEditCycle?: () => void;
  onDismissed?: () => void;
}

interface GridCell {
  date: string; // YYYY-MM-DD
  dayOfMonth: number;
  inMonth: boolean;
  isToday: boolean;
  mark: DayMark;
  rest: boolean;
  restStart: boolean; // window's first day
  restEnd: boolean; // window's last day
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function dayLabel(dateOnly: string): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function shortDate(dateOnly: string): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ScheduleSheet({ visible, onClose, onEditCycle, onDismissed }: ScheduleSheetProps) {
  const theme = useTheme();
  const { home, track, schedules, cycles } = usePeptaData();

  const today = localDateOnly(new Date());
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(today.slice(5, 7)));
  const [selected, setSelected] = useState(today);

  // Re-anchor to the current month each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setYear(Number(today.slice(0, 4)));
      setMonth(Number(today.slice(5, 7)));
      setSelected(today);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const cycle = useMemo(() => activeCycleOf(cycles), [cycles]);
  const pattern = useMemo(() => patternOf(cycle), [cycle]);
  const logged = useMemo(() => loggedDays(track?.doseLogs ?? []), [track?.doseLogs]);

  const grid = useMemo<GridCell[]>(() => {
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=Sun
    const lead = firstDow === 0 ? 6 : firstDow - 1; // Monday-start offset
    const cellCount = Math.ceil((lead + daysInMonth) / 7) * 7;

    const first = new Date(Date.UTC(year, month - 1, 1 - lead));
    const start = `${first.getUTCFullYear()}-${pad2(first.getUTCMonth() + 1)}-${pad2(first.getUTCDate())}`;
    const last = new Date(Date.UTC(year, month - 1, 1 - lead + cellCount - 1));
    const end = `${last.getUTCFullYear()}-${pad2(last.getUTCMonth() + 1)}-${pad2(last.getUTCDate())}`;
    const planned = plannedDays(schedules, start, end);

    return Array.from({ length: cellCount }, (_, i) => {
      const date = new Date(Date.UTC(year, month - 1, 1 - lead + i));
      const dateOnly = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
      const inMonth = date.getUTCMonth() === month - 1;
      const rest = pattern ? isRestDay(pattern, dateOnly) : false;
      const status = rest && pattern ? cycleDayStatus(pattern, dateOnly) : null;
      return {
        date: dateOnly,
        dayOfMonth: date.getUTCDate(),
        inMonth,
        isToday: dateOnly === today,
        mark: inMonth ? markForDay(dateOnly, today, logged, planned, pattern) : 'none',
        rest,
        restStart: status?.phaseStart === dateOnly,
        restEnd: status?.phaseEnd === dateOnly,
      };
    });
  }, [year, month, schedules, pattern, logged, today]);

  const goMonth = (delta: number) => {
    Haptics.selectionAsync().catch(() => undefined);
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    const nextYear = next.getUTCFullYear();
    const nextMonth = next.getUTCMonth() + 1;
    setYear(nextYear);
    setMonth(nextMonth);
    setSelected(
      today.startsWith(`${nextYear}-${pad2(nextMonth)}`)
        ? today
        : `${nextYear}-${pad2(nextMonth)}-01`,
    );
  };

  // ---- selected-day detail ----------------------------------------------
  const doseWord = globalDoseNoun(home?.activeCompounds);
  const detail = useMemo(() => {
    const logsForDay = (track?.doseLogs ?? []).filter(
      (log) => localDateOnly(new Date(log.datetime)) === selected,
    );
    const compound = home?.activeCompounds[0] ?? null;
    const status = pattern ? cycleDayStatus(pattern, selected) : null;
    const cell = grid.find((c) => c.date === selected);

    if (logsForDay.length > 0) {
      const log = logsForDay[0]!;
      const name = home?.activeCompounds.find((c) => c.id === log.compoundId)?.name ?? 'Dose';
      return {
        title: `Logged — ${formatDoseAmount(log)} ${name}, ${timeLabel(log.datetime)}.`,
        line:
          logsForDay.length > 1
            ? `${logsForDay.length} ${doseWord}s logged this day.`
            : status?.phase === 'rest'
              ? 'Logged during a rest window.'
              : 'Nice — on schedule.',
      };
    }
    if (status?.phase === 'rest') {
      return {
        title: 'Rest day — no doses scheduled.',
        line: status.nextPhaseStart
          ? `Back on ${shortDate(status.nextPhaseStart)} — reminders pause until then.`
          : 'This cycle is complete.',
      };
    }
    if (cell?.mark === 'missed') {
      return {
        title: `Nothing logged — a ${doseWord} was planned.`,
        line: 'Tap + to add it late, or leave it. Either is fine.',
      };
    }
    if (cell?.mark === 'due') {
      const dose = compound?.plannedDose
        ? `${compound.plannedDose} ${compound.doseUnit} ${compound.name}`
        : compound?.name ?? 'dose';
      const schedule = schedules?.find((s) => s.active);
      // Protocol times win; the nextDoseAt echo is the legacy fallback.
      const context = timingLabel(schedule?.timing);
      const at = schedule?.timesOfDay?.length
        ? `, ${formatTimesOfDay(schedule.timesOfDay)}${context ? ` · ${context.toLowerCase()}` : ''}`
        : schedule?.nextDoseAt
          ? `, ${timeLabel(schedule.nextDoseAt)}`
          : '';
      // Design copy: "Last dose of this cycle. Two weeks off start Jun 29 —
      // reminders pause automatically."
      const lastOfCycle = isLastDoseOfCycle(`${selected}T12:00:00`, schedules, pattern);
      const restNext =
        pattern && status?.phase === 'on' && status.nextPhaseStart && isRestDay(pattern, status.nextPhaseStart)
          ? `${lastOfCycle ? 'Last dose of this cycle. ' : ''}Rest starts ${shortDate(status.nextPhaseStart)} — reminders pause automatically.`
          : 'Right on cadence.';
      return { title: `${capitalize(doseWord)} day — ${dose}${at}.`, line: restNext };
    }
    return {
      title: 'Nothing scheduled.',
      line: pattern && status?.phase === 'on'
        ? `Week ${status.weekInPhase} of ${status.weeksInPhase} — on cycle.`
        : `Log a ${doseWord} any time from +.`,
    };
  }, [selected, track?.doseLogs, home?.activeCompounds, pattern, grid, schedules, doseWord]);

  const cycleRowLabel = cycle && pattern
    ? `Cycle · ${pattern.weeksOn} wk on, ${pattern.weeksOff} off`
    : 'Set up an on/off cycle';

  return (
    <BottomSheet visible={visible} onClose={onClose} onDismissed={onDismissed} avoidKeyboard={false} scrollable>
      {/* month header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <AppText variant="cardTitle" style={{ fontSize: 17 }}>
          {monthLabel(year, month)}
        </AppText>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <Pressable onPress={() => goMonth(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous month">
            <Icon name="chevron-back" size={18} color={theme.colors.textSecondary} />
          </Pressable>
          <Pressable onPress={() => goMonth(1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next month">
            <Icon name="chevron-forward" size={18} color={theme.colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* weekday header */}
      <View style={{ flexDirection: 'row' }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((letter, i) => (
          <AppText
            key={`${letter}-${i}`}
            variant="caption"
            color="textTertiary"
            align="center"
            style={{ flex: 1, fontSize: 9.5, fontWeight: '700', paddingBottom: 7 }}
          >
            {letter}
          </AppText>
        ))}
      </View>

      {/* grid — rest cells share one continuous band, rounded at window ends
          and at row edges when a window wraps */}
      {Array.from({ length: grid.length / 7 }, (_, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {grid.slice(row * 7, row * 7 + 7).map((cell, col) => (
            <Pressable
              key={cell.date}
              onPress={() => { Haptics.selectionAsync().catch(() => undefined); setSelected(cell.date); }}
              accessibilityRole="button"
              accessibilityLabel={dayLabel(cell.date)}
              style={{
                flex: 1,
                height: CELL_HEIGHT,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: cell.rest ? REST_BG : 'transparent',
                borderTopLeftRadius: cell.rest && (cell.restStart || col === 0) ? 10 : 0,
                borderBottomLeftRadius: cell.rest && (cell.restStart || col === 0) ? 10 : 0,
                borderTopRightRadius: cell.rest && (cell.restEnd || col === 6) ? 10 : 0,
                borderBottomRightRadius: cell.rest && (cell.restEnd || col === 6) ? 10 : 0,
              }}
            >
              <View
                style={{
                  width: 27,
                  height: 27,
                  borderRadius: 9,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: cell.isToday ? theme.colors.primary : 'transparent',
                }}
              >
                <AppText
                  variant="caption"
                  style={{
                    fontSize: 12.5,
                    fontWeight: cell.isToday ? '700' : '600',
                    color: cell.isToday
                      ? theme.colors.onPrimary
                      : cell.inMonth
                        ? theme.colors.textPrimary
                        : theme.colors.textTertiary,
                  }}
                >
                  {cell.dayOfMonth}
                </AppText>
              </View>
              <View
                style={{
                  width: 4.5,
                  height: 4.5,
                  borderRadius: 99,
                  marginTop: 1,
                  backgroundColor:
                    cell.mark === 'due'
                      ? theme.colors.primary
                      : cell.mark === 'logged'
                        ? theme.colors.fiber
                        // A planned day that passed unlogged. Grey rather than
                        // red: this is a record, not a telling-off.
                        : cell.mark === 'missed'
                          ? theme.colors.textTertiary
                          : 'transparent',
                }}
              />
            </Pressable>
          ))}
        </View>
      ))}

      {/* legend */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 13,
          paddingTop: 10,
          marginTop: 8,
          borderTopWidth: 0.5,
          borderTopColor: theme.colors.border,
        }}
      >
        <LegendDot color={theme.colors.primary} label="Due" />
        <LegendDot color={theme.colors.fiber} label="Logged" />
        <LegendDot color="rgba(52,199,89,0.35)" label="Off-cycle rest" />
      </View>

      {/* selected-day detail */}
      <View style={{ backgroundColor: theme.colors.surfaceAlt, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, marginTop: 10 }}>
        <AppText variant="sectionHeader" color="textTertiary" style={{ textTransform: 'uppercase' }}>
          {dayLabel(selected)}
        </AppText>
        <AppText variant="bodyStrong" style={{ fontWeight: '700', marginTop: 6 }}>
          {detail.title}
        </AppText>
        <AppText variant="caption" color="textSecondary" style={{ marginTop: 4 }}>
          {detail.line}
        </AppText>
      </View>

      {/* cycle row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingHorizontal: 4, paddingBottom: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="repeat" size={16} color={theme.colors.primary} />
          <AppText variant="bodyStrong" style={{ fontWeight: '700', fontSize: 14 }}>
            {cycleRowLabel}
          </AppText>
        </View>
        <Pressable
          onPress={() => { Haptics.selectionAsync().catch(() => undefined); onEditCycle?.(); }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={cycle ? 'Edit cycle' : 'Add cycle'}
        >
          <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
            {cycle && pattern ? 'Edit' : 'Add'}
          </AppText>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 7, height: 7, borderRadius: 9, backgroundColor: color }} />
      <AppText variant="caption" color="textSecondary" style={{ fontSize: 11 }}>
        {label}
      </AppText>
    </View>
  );
}
