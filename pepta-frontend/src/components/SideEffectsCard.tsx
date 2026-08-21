// The Side effects card — the last piece of the Progress frame.
//
// Both states live here, because they are the same card: one with a trend and
// one waiting for the first log. Splitting them would let the two drift.

import React, { useState } from 'react';
import { CardIcon } from './CardIcon';
import { Animated, Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { AppText } from './AppText';
import { Card } from './Card';
import { Icon } from './Icon';
import { Mascot } from './Mascot';
import { useTheme } from '../theme';
import { useChartEntrance } from './entranceMotion';
import { monthDay, severityPlot } from './progressCharts';
import { effectLabel, type SideEffectTrend } from '../screens/app/sideEffectTrend';

// The frame draws this plot at the same size as Track's level chart and the
// weight trend — 132 of plot, a 34pt gutter for the value scale, 20 for the
// dates. It shipped at 96 with no gutter and no axis at all, which is why it
// read as a decorative squiggle rather than a severity chart.
const PLOT_HEIGHT = 132;
/** Room on the right for the 5 / 3 / 1 / none scale, inside the card padding. */
const SCALE_GUTTER = 34;
const AXIS_HEIGHT = 20;

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
  const entrance = useChartEntrance({ delay: 60 });
  const plotWidth = Math.max(0, width - SCALE_GUTTER);
  const model = severityPlot(trend.weeks, trend.doseIncreases, plotWidth, PLOT_HEIGHT);

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <CardIcon name="alert-circle-outline" color={theme.colors.primary} />
        <AppText variant="cardTitle" style={{ fontSize: 15 }}>
          Side effects
        </AppText>
        {/* The frame's `.info` glyph — this card's number is a weekly mean of
            a subjective 1-5, and the header is where it says so. */}
        <Icon name="information-circle-outline" size={14} color={theme.colors.textTertiary} />
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
              <Animated.View
                style={{
                  marginTop: 12,
                  opacity: entrance.opacity,
                  transform: [
                    { translateY: PLOT_HEIGHT / 2 },
                    { scaleY: entrance.scaleY },
                    { translateY: -PLOT_HEIGHT / 2 },
                  ],
                }}
              >
              <Svg width={width} height={PLOT_HEIGHT + AXIS_HEIGHT}>
                {model.gridlines.map((line) => (
                  <Line
                    key={line.label}
                    x1={0}
                    y1={line.y}
                    x2={plotWidth}
                    y2={line.y}
                    stroke={theme.colors.border}
                    strokeWidth={1}
                    strokeDasharray="3,4"
                  />
                ))}
                {/* The floor is a solid rule, not another dashed gridline: it
                    is the edge of the scale rather than a value inside it. */}
                <Line
                  x1={0}
                  y1={model.baselineY}
                  x2={plotWidth}
                  y2={model.baselineY}
                  stroke={theme.colors.border}
                  strokeWidth={1}
                />

                {/* THE SCALE. Without it "1.5 of 5" is a caption beside a shape
                    and the chart cannot be read at all — a dip to 2 and a dip
                    to 4 look identical. */}
                {model.gridlines.map((line) => (
                  <SvgText
                    key={`s${line.label}`}
                    x={plotWidth + 6}
                    y={line.y + 3.5}
                    fontSize={9}
                    fontWeight="600"
                    fill={theme.colors.textTertiary}
                  >
                    {line.label}
                  </SvgText>
                ))}
                <SvgText
                  x={plotWidth + 6}
                  y={model.baselineY + 3.5}
                  fontSize={7.5}
                  fontWeight="600"
                  fill={theme.colors.textTertiary}
                  fillOpacity={0.75}
                >
                  {model.baselineLabel}
                </SvgText>

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
                <Path d={model.areaPath} fill={theme.colors.primary} fillOpacity={0.16} />
                <Path
                  d={model.linePath}
                  fill="none"
                  stroke={theme.colors.primary}
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {model.points.map((point, index) => (
                  <Circle key={`p${index}`} cx={point.x} cy={point.y} r={2.2} fill={theme.colors.primary} />
                ))}
                {/* This week, ringed — the number in the readout above is this
                    dot, and the frame makes that link visible. */}
                <Circle
                  cx={model.head.x}
                  cy={model.head.y}
                  r={5}
                  fill={theme.colors.primary}
                  stroke={theme.colors.surface}
                  strokeWidth={2.5}
                />

                {/* Dates. "Milder than your first month" is a claim about time,
                    and the chart could not say when anything happened. */}
                {model.ticks.map((tick) => (
                  <SvgText
                    key={`t${tick.x}`}
                    x={Math.min(Math.max(tick.x, 12), Math.max(12, plotWidth - 12))}
                    y={model.baselineY + 15}
                    fontSize={8.5}
                    fontWeight={tick.isNow ? '800' : '600'}
                    fill={tick.isNow ? theme.colors.primary : theme.colors.textTertiary}
                    textAnchor="middle"
                  >
                    {tick.isNow ? 'This week' : monthDay(tick.at)}
                  </SvgText>
                ))}
              </Svg>
              </Animated.View>
            ) : (
              <View style={{ height: PLOT_HEIGHT + AXIS_HEIGHT }} />
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
