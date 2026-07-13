import { Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { useExerciseHistory, useExerciseTrend, usePRs } from "@/api/hooks";
import { TrendLine } from "@/components/charts";
import { Card, SectionTitle } from "@/components/ui";
import { fromKg, useSettings } from "@/store/settings";
import { colors, spacing } from "@/theme/colors";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const exerciseId = Number(id);
  const { width } = useWindowDimensions();
  const { data: trend } = useExerciseTrend(exerciseId);
  const { data: history } = useExerciseHistory(exerciseId, 10);
  const { data: prs } = usePRs();
  const unit = useSettings((s) => s.unit);

  const exercisePRs = prs?.find((p) => p.exercise.id === exerciseId);
  const chartWidth = width - spacing.md * 4;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
    >
      <Stack.Screen options={{ title: exercisePRs?.exercise.name ?? "Exercise" }} />

      <SectionTitle>Estimated 1RM (Epley)</SectionTitle>
      <Card>
        <TrendLine
          points={(trend ?? []).map((t) => fromKg(t.best_est_1rm, unit))}
          width={chartWidth}
          unit={` ${unit}`}
          labels={
            trend && trend.length >= 2
              ? [shortDate(trend[0].date), shortDate(trend[trend.length - 1].date)]
              : undefined
          }
        />
      </Card>

      <SectionTitle>Rep records</SectionTitle>
      <Card>
        {exercisePRs?.records.length ? (
          exercisePRs.records.map((r) => (
            <View key={r.reps} style={styles.prRow}>
              <Text style={styles.prReps}>{r.reps} RM</Text>
              <Text style={styles.prWeight}>
                {fromKg(r.weight_kg, unit)} {unit}
              </Text>
              <Text style={styles.prDate}>{shortDate(r.date)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>No records yet.</Text>
        )}
      </Card>

      <SectionTitle>History</SectionTitle>
      {history?.length ? (
        history.map((entry) => (
          <Card key={entry.workout_id}>
            <Text style={styles.historyDate}>{shortDate(entry.date)}</Text>
            {entry.sets.map((s) => (
              <Text key={s.id} style={styles.historySet}>
                {s.is_warmup ? "W  " : `${s.set_number}  `}
                {fromKg(s.weight_kg, unit)} {unit} × {s.reps}
                {s.rpe != null ? `  @ RPE ${s.rpe}` : ""}
                {s.source === "device" ? "  📡" : ""}
              </Text>
            ))}
          </Card>
        ))
      ) : (
        <Text style={styles.muted}>Not performed yet.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  prRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  prReps: { color: colors.success, fontWeight: "800", width: 60 },
  prWeight: { color: colors.text, fontSize: 15, fontWeight: "600", flex: 1 },
  prDate: { color: colors.textFaint, fontSize: 12 },
  historyDate: { color: colors.text, fontWeight: "700", marginBottom: spacing.xs },
  historySet: { color: colors.textMuted, fontSize: 13, paddingVertical: 2 },
  muted: { color: colors.textMuted, fontSize: 13 },
});
