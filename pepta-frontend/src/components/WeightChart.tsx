// WeightChart — weight history on a REAL TIME AXIS.
//
// This used to be a chart-kit sparkline handed `points.map(p => p.value)`,
// which threw every timestamp away. That is failure #1 from levelChart's audit,
// living on a second chart: "Real data rendered as an unanchored shape." Two
// weigh-ins a month apart drew exactly like two on consecutive days, and a gap
// where someone stopped weighing in was invisible — the line simply carried on
// as though they had never stopped.
//
// It now draws what the frame specifies, from pure geometry in progressCharts:
//
//   - x is elapsed time, from the first weigh-in to the goal date
//   - the plot FLOOR IS THE GOAL, ruled every `step` above it, so distance
//     down the card is progress and touching the floor is arriving
//   - straight segments between real weigh-ins, never bezier: we know the
//     endpoints, the shape between them is invented
//   - a dot on every real weigh-in, so the chart shows where data EXISTS
//   - a dashed projection to the goal, drawn only when there is one ahead
//
// Points are REAL series from /progress. This component never invents data.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme';
import { AppText } from './AppText';
import { monthDay, weightPlot } from './progressCharts';

export interface WeightChartPoint {
  t: number;
  value: number;
  iso: string;
}

export interface WeightChartProps {
  points: WeightChartPoint[];
  color: string;
  unit: string;
  formatDate(iso: string): string;
  height?: number;
  /** Goal weight, when set — it becomes the plot's floor. */
  goalValue?: number | null;
  /** Projected goal date, when set — it becomes the right edge. */
  goalAt?: number | null;
}

const PILL_HALF_WIDTH = 40;
/** The frame: 132 of plot with the date axis below it. */
const PLOT_HEIGHT = 124;
const AXIS_HEIGHT = 20;

export function WeightChart({
  points,
  color,
  unit,
  formatDate,
  height = PLOT_HEIGHT,
  goalValue = null,
  goalAt = null,
}: WeightChartProps) {
  const theme = useTheme();
  const fade = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = React.useState(0);
  const seriesKey = points.map((p) => `${p.t}:${p.value}`).join('|');

  useEffect(() => {
    fade.setValue(0);
    const animation = Animated.timing(fade, {
      toValue: 1,
      duration: 600,
      delay: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [seriesKey, fade]);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next > 0 && next !== width) setWidth(next);
  };

  if (points.length === 0) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <AppText variant="body" color="textSecondary">
          Log your weight to see your trend.
        </AppText>
      </View>
    );
  }

  const latest = points[points.length - 1]!;
  const plot = width > 0 ? weightPlot(points, goalValue, goalAt, width, height) : null;

  return (
    <View style={{ marginTop: 10 }} onLayout={onLayout}>
      <View style={{ height: height + AXIS_HEIGHT }}>
        {plot ? (
          <Svg width={width} height={height + AXIS_HEIGHT}>
            {/* Value scale — dashed rules with their weights in the gutter. */}
            {plot.gridlines.map((line) => (
              <React.Fragment key={`grid-${line.label}`}>
                <Line
                  x1={0}
                  y1={line.y}
                  x2={plot.plotWidth}
                  y2={line.y}
                  stroke={theme.colors.border}
                  strokeWidth={1}
                  strokeDasharray="3 4"
                />
                <SvgText
                  x={plot.plotWidth + 6}
                  y={line.y + 3.5}
                  fontSize={9}
                  fontWeight="600"
                  fill={theme.colors.textTertiary}
                >
                  {line.label}
                </SvgText>
              </React.Fragment>
            ))}

            {/* The goal: the floor of the plot, and labelled as such. */}
            {plot.goal ? (
              <>
                <Line
                  x1={0}
                  y1={plot.goal.y}
                  x2={plot.plotWidth}
                  y2={plot.goal.y}
                  stroke={color}
                  strokeWidth={1}
                  opacity={0.45}
                />
                <SvgText
                  x={plot.plotWidth + 6}
                  y={plot.goal.y + 3.5}
                  fontSize={9}
                  fontWeight="800"
                  fill={color}
                >
                  {plot.goal.label}
                </SvgText>
              </>
            ) : null}

            {/* Projection first, so the real line sits above it. */}
            {plot.projectedAreaPath ? (
              <Path d={plot.projectedAreaPath} fill={color} fillOpacity={0.055} />
            ) : null}
            <Path d={plot.areaPath} fill={color} fillOpacity={0.14} />
            {plot.projectedPath ? (
              <Path
                d={plot.projectedPath}
                fill="none"
                stroke={color}
                strokeWidth={2.4}
                strokeDasharray="5 4"
                strokeLinecap="round"
                opacity={0.7}
              />
            ) : null}
            <Path
              d={plot.linePath}
              fill="none"
              stroke={color}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* One dot per real weigh-in — the head is drawn larger below. */}
            {plot.dots.slice(0, -1).map((dot, index) => (
              <Circle key={`dot-${index}`} cx={dot.x} cy={dot.y} r={2.7} fill={color} />
            ))}

            {/* Today's rule and the emphasised "you are here" dot. */}
            <Line
              x1={plot.todayX}
              y1={plot.topY - 4}
              x2={plot.todayX}
              y2={plot.baselineY}
              stroke={color}
              strokeWidth={1.5}
              opacity={0.5}
            />
            <Circle
              cx={plot.head.x}
              cy={plot.head.y}
              r={5}
              fill={color}
              stroke={theme.colors.surface}
              strokeWidth={2.5}
            />

            {/* Dates, so the axis says WHEN as well as how much. */}
            {plot.ticks.map((tick, index) => (
              <React.Fragment key={`tick-${tick.at}`}>
                <Line
                  x1={tick.x}
                  y1={plot.baselineY}
                  x2={tick.x}
                  y2={plot.baselineY + 4}
                  stroke={theme.colors.border}
                  strokeWidth={1}
                />
                <SvgText
                  x={tick.x}
                  y={plot.baselineY + 15}
                  fontSize={8.5}
                  fontWeight="600"
                  fill={theme.colors.textTertiary}
                  // The first tick sits at x=0 and the last at the plot's right
                  // edge, so centring every label clips the outer two — the
                  // first rendered as "y 11" instead of "May 11". Anchor the
                  // ends inward.
                  textAnchor={
                    index === 0 ? 'start' : index === plot.ticks.length - 1 ? 'end' : 'middle'
                  }
                >
                  {monthDay(tick.at)}
                </SvgText>
              </React.Fragment>
            ))}
          </Svg>
        ) : null}

        {/* The floating readout, anchored to the real head coordinates. */}
        {plot ? (
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: Math.max(
                  6,
                  Math.min(plot.plotWidth - PILL_HALF_WIDTH * 2 - 6, plot.head.x - PILL_HALF_WIDTH),
                ),
                top: Math.max(0, plot.head.y - 62),
                zIndex: 2,
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderWidth: 0.5,
                borderRadius: 12,
                paddingVertical: 5,
                paddingHorizontal: 10,
                alignItems: 'center',
              } as ViewStyle,
              theme.shadows.card,
              { opacity: fade },
            ]}
          >
            <AppText variant="bodyStrong" style={{ fontWeight: '800' }}>
              {latest.value}
              <AppText variant="caption" color="textSecondary"> {unit}</AppText>
            </AppText>
            <AppText
              variant="caption"
              color="textTertiary"
              align="center"
              style={{ fontSize: 10, marginTop: 1 }}
            >
              {formatDate(latest.iso)}
            </AppText>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}
