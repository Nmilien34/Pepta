// The Medication level card.
//
// Lifted out of TrackScreen so the range control can be rendered in a test.
// That control shipped once as decoration — a View with no onPress, hardcoded
// to its first option, above a curve the backend only ever drew +/-7 days —
// and nothing caught it because nothing rendered it. It is a Pressable now,
// and the tests below press it.

import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { MedicationLevelChart } from './MedicationLevelChart';
import { useTheme } from '../theme';
import { LEVEL_RANGES, levelRangeView, type HomeLevel } from '../screens/app/levelRange';
import type { useLevelRange } from '../screens/app/useLevelRange';
import {
  LEVEL_SUPPRESSION_COPY,
  type LevelSuppressionReason,
} from '../screens/app/levelSuppression';

export function MedicationLevelCard({
  ml,
  range,
  compoundName,
  doseTimes,
  levelUnit,
  doseWord,
  suppressed,
  onLogDose,
  onOpenSettings,
}: {
  /** The +/-7 day level from /home. Structural, so the card does not reach
   *  into the data context to know its own props. */
  ml: (HomeLevel & { currentEstimate: number; troughEstimate: number }) | null;
  range: ReturnType<typeof useLevelRange>;
  compoundName: string;
  /** Logged doses for THIS compound — each one marks a rise on the curve. */
  doseTimes: { datetime: string }[];
  levelUnit: string;
  /** This compound's own noun — the card is about one medication. */
  doseWord: string;
  /** Oral route or no half-life: the curve is suppressed, not pending. */
  suppressed: LevelSuppressionReason | null;
  onLogDose: () => void;
  onOpenSettings: () => void;
}) {
  const theme = useTheme();
  const hasCurve = !!ml && ml.curve.length > 1;
  const view = levelRangeView({
    range: range.range,
    home: ml,
    homeDoses: doseTimes,
    fetched: range.fetched,
    loading: range.loading,
  });

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="chart-line" size={18} color={theme.colors.primary} />
          <AppText variant="cardTitle" style={{ fontSize: 15 }}>
            Medication level
          </AppText>
        </View>
        {ml ? (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              onOpenSettings();
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              backgroundColor: theme.colors.surfaceAlt,
              paddingVertical: 4,
              paddingHorizontal: 9,
              borderRadius: theme.radii.pill,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <AppText variant="caption" color="primary" style={{ fontWeight: '800' }}>
              {Math.round((ml.currentEstimate / Math.max(ml.peakEstimate, 1)) * 100)}%
            </AppText>
            <Icon name="chevron-forward" size={13} color={theme.colors.primary} stroke={2.3} />
          </Pressable>
        ) : null}
      </View>

      {hasCurve ? (
        <>
          {/* Real now. This control was deleted in an earlier pass for being
              decoration — a View with no onPress, hardcoded to its first
              option, over a curve the backend only ever drew +/-7 days. Every
              option now fetches the window it names. */}
          <View
            style={{
              flexDirection: 'row',
              alignSelf: 'flex-start',
              backgroundColor: theme.colors.surfaceAlt,
              borderRadius: theme.radii.pill,
              padding: 3,
              gap: 2,
              marginTop: theme.spacing.md,
            }}
          >
            {LEVEL_RANGES.map((option) => {
              const on = range.range === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => undefined);
                    range.setRange(option.key);
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Show ${option.label.toLowerCase()}`}
                  style={({ pressed }) => ({
                    paddingVertical: 5,
                    paddingHorizontal: 11,
                    borderRadius: theme.radii.pill,
                    backgroundColor: on ? theme.colors.surface : 'transparent',
                    opacity: pressed ? 0.72 : 1,
                  })}
                >
                  <AppText
                    variant="caption"
                    style={{
                      fontSize: 12,
                      fontWeight: on ? '800' : '700',
                      color: on ? theme.colors.textPrimary : theme.colors.textSecondary,
                    }}
                  >
                    {option.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {view.curve.length > 1 ? (
            <>
              {/* The whole curve, with its timestamps — not curve.map(p => p.level).
                  Dropping datetime is what turned a real time series into a shape:
                  no axis, no now-marker, and a dot on the LAST point, six days into
                  the future, beside a caption that read "Current". */}
              <MedicationLevelChart
                curve={view.curve}
                doses={view.doses}
                unit={levelUnit}
                peak={view.peak}
              />
              {/* Peak now sits in the chart's own legend row, per the frame.
                  Trough went with the duplicate: troughEstimate is forward-
                  looking, computed to the NEXT dose, so printing it under a
                  90-day history was two different windows in one row. */}
            </>
          ) : (
            // A window with nothing in it yet. Never the week curve as a
            // stand-in: seven days under a control reading 90 is the lie this
            // whole change exists to remove.
            <View style={{ height: 190, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              {range.failed ? (
                <>
                  <AppText variant="caption" color="textSecondary" align="center">
                    Couldn’t load that window.
                  </AppText>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => undefined);
                      range.retry();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Try that window again"
                    hitSlop={8}
                  >
                    <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
                      Try again
                    </AppText>
                  </Pressable>
                </>
              ) : (
                <ActivityIndicator color={theme.colors.primary} />
              )}
            </View>
          )}
        </>
      ) : (
        <View style={{ marginTop: theme.spacing.md, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radii.card, padding: 14, gap: 10 }}>
          <AppText variant="bodyStrong" style={{ fontWeight: '800' }}>
            {compoundName}
          </AppText>
          <AppText variant="body" color="textSecondary">
            {suppressed
              ? LEVEL_SUPPRESSION_COPY[suppressed]
              : `Log your first ${doseWord} to start building your medication level curve.`}
          </AppText>
          {suppressed ? null : (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              onLogDose();
            }}
            style={({ pressed }) => ({
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: theme.radii.pill,
              backgroundColor: 'rgba(126, 87, 194, 0.08)',
              borderWidth: 0.5,
              borderColor: 'rgba(126, 87, 194, 0.16)',
              opacity: pressed ? 0.72 : 1,
            })}
            accessibilityRole="button"
          >
            <Icon name="add" size={14} color={theme.colors.primary} />
            <AppText variant="caption" color="primary" style={{ fontWeight: '800' }}>
              Log shot
            </AppText>
          </Pressable>
          )}
        </View>
      )}
    </>
  );
}

