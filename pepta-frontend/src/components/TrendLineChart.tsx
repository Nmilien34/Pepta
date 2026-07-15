// TrendLineChart — Pepta's line chart, now rendered by react-native-chart-kit
// (which draws through the same react-native-svg we already ship). This wrapper
// centralizes the brand chart config so every graph reads identically: bezier
// line, soft area fill, no gridlines or axis labels (the surrounding card
// supplies the context), and only the latest point dotted. Consumers pass REAL
// series only — no placeholder data lives here.

import React, { useState, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { LineChart } from "react-native-chart-kit";

// chart-kit wants rgba() callbacks; theme tokens are hex.
function rgba(hex: string, opacity: number): string {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return hex;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export interface TrendLineChartProps {
  /** Real data series, oldest → newest. */
  values: number[];
  color: string;
  height: number;
  /** Peak opacity of the area fill under the line. */
  fillOpacity?: number;
  /** Dot the latest point (all other points stay undotted). */
  showLastDot?: boolean;
  /** Optional overlay anchored at the latest point (e.g. a value pill). */
  renderLastDot?(point: { x: number; y: number; width: number }): ReactNode;
  /** Provide a width to skip self-measurement (parent already measured). */
  width?: number;
}

export function TrendLineChart({
  values,
  color,
  height,
  fillOpacity = 0.16,
  showLastDot = true,
  renderLastDot,
  width: fixedWidth,
}: TrendLineChartProps) {
  const [measured, setMeasured] = useState(0);
  const width = fixedWidth ?? measured;

  const series = values.length > 0 ? values : [0];
  const lastIndex = series.length - 1;
  const hiddenDots = series
    .map((_, i) => i)
    .filter((i) => (showLastDot || renderLastDot ? i !== lastIndex : true));

  const onLayout = (e: LayoutChangeEvent) => {
    if (fixedWidth == null) setMeasured(Math.round(e.nativeEvent.layout.width));
  };

  return (
    <View onLayout={onLayout}>
      {width > 0 ? (
        <LineChart
          data={{ labels: [], datasets: [{ data: series, strokeWidth: 3 }] }}
          width={width}
          height={height}
          bezier
          withInnerLines={false}
          withOuterLines={false}
          withVerticalLabels={false}
          withHorizontalLabels={false}
          withShadow
          hidePointsAtIndex={hiddenDots}
          renderDotContent={
            renderLastDot
              ? ({ x, y, index }) =>
                  index === lastIndex ? (
                    <React.Fragment key="last-dot-content">
                      {renderLastDot({ x, y, width })}
                    </React.Fragment>
                  ) : null
              : undefined
          }
          chartConfig={{
            backgroundGradientFrom: "#ffffff",
            backgroundGradientFromOpacity: 0,
            backgroundGradientTo: "#ffffff",
            backgroundGradientToOpacity: 0,
            fillShadowGradientFrom: color,
            fillShadowGradientFromOpacity: fillOpacity,
            fillShadowGradientTo: color,
            fillShadowGradientToOpacity: 0,
            color: (opacity = 1) => rgba(color, opacity),
            labelColor: (opacity = 1) => rgba("#6B6B76", opacity),
            strokeWidth: 3,
            propsForDots: { r: "4.5", stroke: "#ffffff", strokeWidth: "2.5" },
            paddingRight: 12,
            paddingTop: 16,
          }}
          style={{ paddingRight: 0 }}
        />
      ) : null}
    </View>
  );
}
