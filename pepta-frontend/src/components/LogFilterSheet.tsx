// The filter behind "Your log"'s two header controls.
//
// ONE SHEET, BOTH CONTROLS. The pill opens it at the scope, the button opens
// it at the kinds, but they are one question asked twice — "what, and when" —
// and splitting them across two sheets would make the common pairing (doses,
// this week) two round trips.
//
// COUNTS ARE SHOWN, AND ZEROES ARE STILL TAPPABLE. A group with nothing in it
// at this scope says 0 rather than hiding: "no side effects this month" is an
// answer somebody actively wants, and a filter that silently drops its own
// options cannot give it.

import React from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Icon } from './Icon';
import { useTheme } from '../theme';
import {
  LOG_GROUPS,
  LOG_SCOPES,
  NO_FILTER,
  isFiltered,
  toggleGroup,
  type LogFilter,
  type LogGroupKey,
} from '../screens/app/logFilters';

export interface LogFilterSheetProps {
  visible: boolean;
  filter: LogFilter;
  /** Counts per group at the CURRENT scope, so the numbers track the pill. */
  counts: Record<LogGroupKey, number>;
  /** How many entries the filter as it stands would show. */
  resultCount: number;
  onChange(next: LogFilter): void;
  onClose(): void;
}

export function LogFilterSheet({
  visible,
  filter,
  counts,
  resultCount,
  onChange,
  onClose,
}: LogFilterSheetProps) {
  const theme = useTheme();
  const tap = () => Haptics.selectionAsync().catch(() => undefined);

  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard={false} scrollable>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="cardTitle" style={{ fontSize: 17 }}>
          Filter your log
        </AppText>
        {isFiltered(filter) ? (
          <Pressable
            onPress={() => {
              tap();
              onChange(NO_FILTER);
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear filters"
            hitSlop={10}
          >
            <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
              Clear
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <AppText variant="sectionHeader" color="textTertiary" style={{ textTransform: 'uppercase', marginTop: 16 }}>
        When
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {LOG_SCOPES.map((scope) => {
          const on = filter.scope === scope.key;
          return (
            <Pressable
              key={scope.key}
              onPress={() => {
                tap();
                onChange({ ...filter, scope: scope.key });
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={scope.label}
              style={({ pressed }) => ({
                paddingVertical: 9,
                paddingHorizontal: 14,
                borderRadius: theme.radii.pill,
                backgroundColor: on ? theme.colors.primary : theme.colors.surfaceAlt,
                opacity: pressed ? 0.72 : 1,
              })}
            >
              <AppText
                variant="caption"
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: on ? theme.colors.onPrimary : theme.colors.textSecondary,
                }}
              >
                {scope.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <AppText variant="sectionHeader" color="textTertiary" style={{ textTransform: 'uppercase', marginTop: 20 }}>
        What
      </AppText>
      <AppText variant="caption" color="textTertiary" style={{ fontSize: 11, marginTop: 4 }}>
        Nothing picked shows everything.
      </AppText>
      <View style={{ marginTop: 6 }}>
        {LOG_GROUPS.map((group) => {
          const on = filter.groups.includes(group.key);
          const count = counts[group.key] ?? 0;
          return (
            <Pressable
              key={group.key}
              onPress={() => {
                tap();
                onChange(toggleGroup(filter, group.key));
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${group.label}, ${count}`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 12,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 7,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: on ? theme.colors.primary : 'transparent',
                  borderWidth: on ? 0 : 1.5,
                  borderColor: theme.colors.border,
                }}
              >
                {on ? <Icon name="checkmark" size={14} color={theme.colors.onPrimary} stroke={3} /> : null}
              </View>
              <AppText variant="body" style={{ flex: 1, fontWeight: on ? '700' : '600' }}>
                {group.label}
              </AppText>
              <AppText variant="caption" color={count === 0 ? 'textTertiary' : 'textSecondary'}>
                {count}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginTop: 16 }}>
        {/* Says what pressing it lands on, so nobody applies a filter to find
            out it hid everything. */}
        <Button
          label={
            resultCount === 0
              ? 'Nothing matches'
              : `Show ${resultCount} ${resultCount === 1 ? 'entry' : 'entries'}`
          }
          onPress={() => {
            tap();
            onClose();
          }}
        />
      </View>
    </BottomSheet>
  );
}
