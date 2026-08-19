// The Side effects card — the last piece of the Progress frame.
//
// Both states live here, because they are the same card: one with a trend and
// one waiting for the first log. Splitting them would let the two drift.

import React, { useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { AppText } from './AppText';
import { Card } from './Card';
import { Icon } from './Icon';
import { Mascot } from './Mascot';
import { useTheme } from '../theme';
import {
  effectLabel,
  severityChartModel,
  type SideEffectTrend,
} from '../screens/app/sideEffectTrend';

const PLOT_HEIGHT = 96;

export interface SideEffectsCardProps {
  trend: SideEffectTrend;
  /** Selected chip; null is "All". */
  type: string | null;
  onPickType(next: string | null): void;
  onLog(): void;
}

export function SideEffectsCard({ trend, type, onPickType, onLog }: SideEffectsCardProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const model = severityChartModel(trend.weeks, trend.doseIncreases, width, PLOT_HEIGHT);

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="alert-circle-outline" size={18} color={theme.colors.warning} />
        <AppText variant="cardTitle" style={{ fontSize: 15 }}>
          Side effects
        </AppText>
      </View>

      {trend.empty ? (
        <View style={{ alignItems: 'center', paddingTop: 20, paddingHorizontal: 6, paddingBottom: 6 }}>
          <Mascot pose="idle" size={64} />
          <AppText variant="bodyStrong" align="center" style={{ fontSize: 15, marginTop: 10, fontWeight: '700' }}>
            Nothing logged yet
          </AppText>
          <AppText
            variant="caption"
            color="textSecondary"
            align="center"
            style={{ marginTop: 6, lineHeight: 17, maxWidth: 250 }}
          >
            Log how you feel after a shot and we’ll show you whether it eases off week by week —
            and what happens when your dose goes up.
          </AppText>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              onLog();
            }}
            accessibilityRole="button"
            accessibilityLabel="Log how you feel"
            style={({ pressed }) => ({
              marginTop: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              paddingVertical: 9,
              paddingHorizontal: 16,
              borderRadius: theme.radii.pill,
              backgroundColor: theme.colors.surfaceAlt,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Icon name="add" size={15} color={theme.colors.primary} />
            <AppText variant="caption" color="primary" style={{ fontWeight: '800' }}>
              Log how you feel
            </AppText>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Their own effects, not a fixed menu. "All" only earns its place
              when there is more than one thing to filter between. */}
          {trend.types.length > 1 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
              {[null, ...trend.types].map((option) => {
                const on = option === type;
                return (
                  <Pressable
                    key={option ?? 'all'}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => undefined);
                      onPickType(option);
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={option ? effectLabel(option) : 'All side effects'}
                    style={({ pressed }) => ({
                      paddingVertical: 6,
                      paddingHorizontal: 11,
                      borderRadius: theme.radii.pill,
                      backgroundColor: on ? theme.colors.primary : theme.colors.surfaceAlt,
                      opacity: pressed ? 0.72 : 1,
                    })}
                  >
                    <AppText
                      variant="caption"
                      style={{
                        fontSize: 11.5,
                        fontWeight: '700',
                        color: on ? theme.colors.onPrimary : theme.colors.textSecondary,
                      }}
                    >
                      {option ? effectLabel(option) : 'All'}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <AppText variant="statMedium" style={{ fontSize: 22 }}>
                {trend.current != null ? trend.current.toFixed(1) : '—'}
              </AppText>
              <AppText variant="caption" color="textSecondary" style={{ fontSize: 12, fontWeight: '700' }}>
                {' '}of 5
              </AppText>
            </View>
            {trend.comparison ? (
              <AppText variant="caption" color="textTertiary" style={{ marginTop: 5 }}>
                {trend.comparison}
              </AppText>
            ) : (
              <AppText variant="caption" color="textTertiary" style={{ marginTop: 5 }}>
                One week logged so far — a trend needs two.
              </AppText>
            )}
          </View>

          <View onLayout={(event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width))}>
            {model ? (
              <Svg width={width} height={PLOT_HEIGHT} style={{ marginTop: 12 }}>
                {model.gridlines.map((line) => (
                  <Line
                    key={line.value}
                    x1={0}
                    y1={line.y}
                    x2={width}
                    y2={line.y}
                    stroke={theme.colors.border}
                    strokeWidth={1}
                    strokeDasharray="3,4"
                  />
                ))}
                {/* Dose increases, behind the line: the question is what the
                    curve does AT them, so they must not sit on top of it. */}
                {model.markers.map((x, index) => (
                  <Line
                    key={`m${index}`}
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={model.baselineY}
                    stroke={theme.colors.primary}
                    strokeWidth={1.5}
                    strokeDasharray="4,3"
                    strokeOpacity={0.7}
                  />
                ))}
                <Path
                  d={model.path}
                  fill="none"
                  stroke={theme.colors.primary}
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {model.points.map((point, index) => (
                  <Circle key={`p${index}`} cx={point.x} cy={point.y} r={3} fill={theme.colors.primary} />
                ))}
              </Svg>
            ) : (
              <View style={{ height: PLOT_HEIGHT }} />
            )}
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 8,
              paddingTop: 9,
              borderTopWidth: 0.5,
              borderTopColor: theme.colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 13, height: 2.5, borderRadius: 2, backgroundColor: theme.colors.primary }} />
              <AppText variant="caption" color="textSecondary" style={{ fontSize: 11 }}>
                Weekly average
              </AppText>
            </View>
            {trend.doseIncreases.length > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View
                  style={{
                    width: 0,
                    height: 11,
                    borderLeftWidth: 2,
                    borderStyle: 'dashed',
                    borderColor: theme.colors.primary,
                    opacity: 0.7,
                  }}
                />
                <AppText variant="caption" color="textSecondary" style={{ fontSize: 11 }}>
                  Dose increase
                </AppText>
              </View>
            ) : null}
          </View>
        </>
      )}
    </Card>
  );
}
