// The medication-level chart. Real data, drawn honestly.
//
// Hand-rolled on react-native-svg rather than react-native-chart-kit, which the
// old TrendLineChart used. chart-kit can do axes and gridlines, but it cannot
// express the two things that make this chart truthful: a marker at NOW rather
// than at the end of the series, and one line that changes style mid-series
// where measured history becomes projection. Working around that would mean
// driving chart-kit's `decorator` escape hatch for most of the drawing anyway —
// and every other chart-shaped thing in this app (WeekStrip, ProgressRing,
// BodyMap) is already plain SVG.
//
// All geometry lives in screens/app/levelChart.ts so the honesty rules are unit
// tested away from React: zero baseline, marker at now, straight segments
// between real samples, x spaced by elapsed time.
//
// The readout sits ABOVE the plot as ordinary text. Drawn inside the SVG it
// landed on the top gridline with the curve's peak running through it.

import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { AppText } from './AppText';
import { useTheme } from '../theme';
import { buildLevelChartModel, shortTick, type LevelPoint } from '../screens/app/levelChart';

const PLOT_HEIGHT = 132;
/** Room on the right for the value scale, inside the card's own padding. */
const SCALE_GUTTER = 34;
const AXIS_HEIGHT = 20;

export interface MedicationLevelChartProps {
  curve: readonly LevelPoint[];
  /** Doses actually logged, so each rise can be marked. */
  doses?: readonly { datetime: string }[];
  unit: string;
  now?: Date;
}

export function MedicationLevelChart({
  curve,
  doses = [],
  unit,
  now = new Date(),
}: MedicationLevelChartProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) =>
    setWidth(Math.round(event.nativeEvent.layout.width));

  const plotWidth = Math.max(0, width - SCALE_GUTTER);
  const model = buildLevelChartModel({
    curve,
    now,
    width: plotWidth,
    height: PLOT_HEIGHT,
    doses,
  });

  // Value shown in the readout is the level AT NOW — the same number the marker
  // sits on. These used to disagree: the caption read currentEstimate while the
  // dot sat on the final projected point.
  const decimals = model && model.yMax < 1 ? 2 : 1;

  return (
    <View onLayout={onLayout}>
      {model ? (
        <>
          <View style={{ marginTop: theme.spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
              <AppText variant="statMedium" style={{ fontSize: 22 }}>
                {model.now!.level.toFixed(decimals)}
              </AppText>
              <AppText variant="caption" color="textSecondary" style={{ fontWeight: '700' }}>
                {unit}
              </AppText>
            </View>
            <AppText variant="caption" color="textTertiary" style={{ marginTop: 4 }}>
              Right now · {formatNow(now)}
            </AppText>
          </View>

          <Svg
            width={width}
            height={PLOT_HEIGHT + AXIS_HEIGHT}
            style={{ marginTop: theme.spacing.md }}
          >
            {model.gridlines.map((line) => (
              <Line
                key={line.value}
                x1={0}
                y1={line.y}
                x2={plotWidth}
                y2={line.y}
                stroke={theme.colors.border}
                strokeWidth={1}
                strokeDasharray="3,4"
              />
            ))}
            {model.timeTicks
              .filter((tick) => !tick.isNow && tick.x > 1 && tick.x < plotWidth - 1)
              .map((tick) => (
                <Line
                  key={`v${tick.x}`}
                  x1={tick.x}
                  y1={0}
                  x2={tick.x}
                  y2={model.baselineY}
                  stroke={theme.colors.border}
                  strokeWidth={1}
                  strokeDasharray="3,4"
                />
              ))}
            <Line
              x1={0}
              y1={model.baselineY}
              x2={plotWidth}
              y2={model.baselineY}
              stroke={theme.colors.border}
              strokeWidth={1}
            />

            {model.gridlines.map((line) => (
              <SvgText
                key={`l${line.value}`}
                x={plotWidth + 6}
                y={line.y + 3.5}
                fontSize={9}
                fontWeight="600"
                fill={theme.colors.textTertiary}
              >
                {line.value < 1 ? line.value.toFixed(2) : line.value.toFixed(1)}
              </SvgText>
            ))}
            <SvgText
              x={plotWidth + 6}
              y={model.baselineY + 3.5}
              fontSize={9}
              fontWeight="600"
              fill={theme.colors.textTertiary}
            >
              0
            </SvgText>

            {/* Measured: computed from doses the user actually logged. */}
            <Path d={model.pastArea} fill={theme.colors.primary} fillOpacity={0.14} />
            {/* Projected: derived from the schedule, drawn so it cannot pass
                for history. */}
            <Path d={model.futureArea} fill={theme.colors.primary} fillOpacity={0.055} />
            <Path
              d={model.pastPath}
              fill="none"
              stroke={theme.colors.primary}
              strokeWidth={2.6}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <Path
              d={model.futurePath}
              fill="none"
              stroke={theme.colors.primary}
              strokeWidth={2.4}
              strokeDasharray="5,4"
              strokeOpacity={0.7}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {model.doseMarkers.map((marker, index) => (
              <Circle
                key={`d${index}`}
                cx={marker.x}
                cy={marker.y}
                r={2.7}
                fill={theme.colors.primary}
                fillOpacity={marker.isFuture ? 0.45 : 1}
              />
            ))}

            <Line
              x1={model.now!.x}
              y1={0}
              x2={model.now!.x}
              y2={model.baselineY}
              stroke={theme.colors.primary}
              strokeWidth={1.5}
              strokeOpacity={0.5}
            />
            <Circle
              cx={model.now!.x}
              cy={model.now!.y}
              r={5}
              fill={theme.colors.primary}
              stroke={theme.colors.surface}
              strokeWidth={2.5}
            />

            {model.timeTicks.map((tick) => (
              <SvgText
                key={`t${tick.x}`}
                x={clampLabel(tick.x, plotWidth)}
                y={model.baselineY + 15}
                fontSize={8.5}
                fontWeight={tick.isNow ? '800' : '600'}
                fill={tick.isNow ? theme.colors.primary : theme.colors.textTertiary}
                textAnchor="middle"
              >
                {tick.isNow ? 'Today' : shortTick(tick.at)}
              </SvgText>
            ))}
          </Svg>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              marginTop: theme.spacing.sm,
              paddingTop: theme.spacing.sm,
              borderTopWidth: 0.5,
              borderTopColor: theme.colors.border,
            }}
          >
            <Legend color={theme.colors.primary} label="From your logs" />
            <Legend color={theme.colors.primary} label="Projected" dashed />
          </View>
        </>
      ) : null}
    </View>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View
        style={{
          width: 14,
          height: 2.5,
          borderRadius: 2,
          backgroundColor: color,
          opacity: dashed ? 0.45 : 1,
        }}
      />
      <AppText variant="caption" color="textSecondary">
        {label}
      </AppText>
    </View>
  );
}

/** Keep the first and last labels from hanging off the plot. */
function clampLabel(x: number, width: number): number {
  return Math.min(Math.max(x, 12), Math.max(12, width - 12));
}

function formatNow(now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 16).replace('T', ' ');
  }
}
