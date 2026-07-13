import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline, Rect } from "react-native-svg";

import { colors, spacing } from "@/theme/colors";

const CHART_HEIGHT = 140;
const PAD = { top: 12, bottom: 20, left: 8, right: 44 };

function niceRange(values: number[]): [number, number] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [min * 0.9, max * 1.1 || 1];
  const pad = (max - min) * 0.12;
  return [min - pad, max + pad];
}

/** Single-series trend line: 2px line, 8px endpoint marker, direct-labeled
 * latest value, recessive hairline grid. */
export function TrendLine({
  points,
  color = colors.chartTeal,
  width = 320,
  unit = "",
  labels,
}: {
  points: number[];
  color?: string;
  width?: number;
  unit?: string;
  labels?: [string, string]; // first / last x labels
}) {
  if (points.length < 2) {
    return <Text style={styles.placeholder}>Need at least two data points for a trend.</Text>;
  }
  const [lo, hi] = niceRange(points);
  const plotW = width - PAD.left - PAD.right;
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * plotW;
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;
  const coords = points.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const last = points[points.length - 1];

  return (
    <View>
      <Svg width={width} height={CHART_HEIGHT}>
        {[0.25, 0.5, 0.75].map((f) => (
          <Line
            key={f}
            x1={PAD.left}
            x2={PAD.left + plotW}
            y1={PAD.top + f * plotH}
            y2={PAD.top + f * plotH}
            stroke={colors.border}
            strokeWidth={StyleSheet.hairlineWidth}
          />
        ))}
        <Polyline points={coords} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        <Circle cx={x(points.length - 1)} cy={y(last)} r={4} fill={color} />
      </Svg>
      {/* direct label of the latest value, in text ink next to the colored mark */}
      <View style={[styles.lastLabel, { top: Math.max(0, y(last) - 9) }]}>
        <Text style={styles.lastLabelText}>
          {Math.round(last * 10) / 10}
          {unit}
        </Text>
      </View>
      {labels ? (
        <View style={styles.xLabels}>
          <Text style={styles.axisText}>{labels[0]}</Text>
          <Text style={styles.axisText}>{labels[1]}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Vertical bars for weekly totals: thin bars, 4px rounded top anchored to a
 * flat baseline, 2px gaps, direct-labeled latest bar. */
export function WeeklyBars({
  values,
  color = colors.chartTeal,
  width = 320,
  unit = "",
}: {
  values: number[];
  color?: string;
  width?: number;
  unit?: string;
}) {
  if (values.length === 0) {
    return <Text style={styles.placeholder}>No data yet.</Text>;
  }
  const max = Math.max(...values, 1);
  const plotW = width - PAD.left - PAD.right;
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;
  const barW = Math.max(4, Math.min(28, plotW / values.length - 2));
  const step = plotW / values.length;
  const baseline = PAD.top + plotH;

  return (
    <View>
      <Svg width={width} height={CHART_HEIGHT}>
        <Line
          x1={PAD.left}
          x2={PAD.left + plotW}
          y1={baseline}
          y2={baseline}
          stroke={colors.border}
          strokeWidth={1}
        />
        {values.map((v, i) => {
          const h = Math.max(2, (v / max) * plotH);
          return (
            <Rect
              key={i}
              x={PAD.left + i * step + (step - barW) / 2}
              y={baseline - h}
              width={barW}
              height={h}
              rx={4}
              fill={i === values.length - 1 ? color : colors.surfaceRaised}
            />
          );
        })}
      </Svg>
      <View style={[styles.lastLabel, { top: Math.max(0, baseline - (values[values.length - 1] / max) * plotH - 18) }]}>
        <Text style={styles.lastLabelText}>
          {Math.round(values[values.length - 1]).toLocaleString()}
          {unit}
        </Text>
      </View>
    </View>
  );
}

/** Horizontal labeled magnitude rows (identity lives in the row label, so a
 * single hue carries all bars). */
export function LabeledBars({
  data,
  color = colors.chartCrimson,
}: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  if (data.length === 0) return <Text style={styles.placeholder}>No data yet.</Text>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <View style={{ gap: 6 }}>
      {data.map((d) => (
        <View key={d.label} style={styles.hRow}>
          <Text style={styles.hLabel}>{d.label}</Text>
          <View style={styles.hTrack}>
            <View
              style={{
                width: `${Math.max(2, (d.value / max) * 100)}%`,
                height: 10,
                borderRadius: 4,
                backgroundColor: color,
              }}
            />
          </View>
          <Text style={styles.hValue}>{Math.round(d.value).toLocaleString()}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { color: colors.textMuted, fontSize: 13, paddingVertical: spacing.md },
  lastLabel: { position: "absolute", right: 0 },
  lastLabelText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  xLabels: { flexDirection: "row", justifyContent: "space-between", paddingRight: PAD.right },
  axisText: { color: colors.textFaint, fontSize: 10 },
  hRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  hLabel: { color: colors.textMuted, fontSize: 12, width: 84 },
  hTrack: { flex: 1 },
  hValue: { color: colors.text, fontSize: 12, fontWeight: "600", width: 56, textAlign: "right" },
});
