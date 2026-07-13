import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { usePRs, useWorkout } from "@/api/hooks";
import { Badge, Button, Card, Loading, SectionTitle } from "@/components/ui";
import { fromKg, rpeToDisplay, useSettings } from "@/store/settings";
import { colors, spacing } from "@/theme/colors";

const PR_REP_CAP = 12; // server clamps rep records at 12

export default function WorkoutSummary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: workout, isLoading } = useWorkout(Number(id));
  const { data: prs } = usePRs();
  const { unit, intensityMode } = useSettings();

  if (isLoading || !workout) return <Loading />;

  const workingSets = workout.exercises.flatMap((we) =>
    we.sets.filter((s) => !s.is_warmup).map((s) => ({ we, set: s })),
  );
  const totalVolume = workingSets.reduce((sum, { set }) => sum + set.reps * set.weight_kg, 0);
  const durationMin =
    workout.finished_at
      ? Math.max(
          1,
          Math.round(
            (new Date(workout.finished_at).getTime() - new Date(workout.started_at).getTime()) /
              60000,
          ),
        )
      : null;

  const isNewPR = (exerciseId: number, set: { reps: number; weight_kg: number; completed_at: string }) => {
    const records = prs?.find((p) => p.exercise.id === exerciseId)?.records ?? [];
    const capped = Math.min(set.reps, PR_REP_CAP);
    return records.some(
      (r) => r.reps === capped && r.weight_kg === set.weight_kg && r.date === set.completed_at,
    );
  };
  const prCount = workingSets.filter(({ we, set }) => isNewPR(we.exercise.id, set)).length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
    >
      <Stack.Screen options={{ title: "Workout complete" }} />
      <Text style={styles.headline}>Nice work! 💪</Text>

      <View style={styles.statRow}>
        <Stat label="Duration" value={durationMin !== null ? `${durationMin} min` : "—"} />
        <Stat label="Sets" value={String(workingSets.length)} />
        <Stat
          label="Volume"
          value={`${Math.round(fromKg(totalVolume, unit)).toLocaleString()} ${unit}`}
        />
        <Stat label="PRs" value={String(prCount)} accent={prCount > 0} />
      </View>

      {workout.notes ? (
        <Card>
          <Text style={styles.notes}>“{workout.notes}”</Text>
        </Card>
      ) : null}

      <SectionTitle>Exercises</SectionTitle>
      {workout.exercises.map((we) => (
        <Card key={we.id}>
          <Text style={styles.exerciseName}>{we.exercise.name}</Text>
          {we.sets.map((s) => (
            <View key={s.id} style={styles.setLine}>
              <Text style={styles.setText}>
                {s.is_warmup ? "W" : s.set_number}
                {"   "}
                {fromKg(s.weight_kg, unit)} {unit} × {s.reps}
                {s.rpe != null ? `   ${rpeToDisplay(s.rpe, intensityMode)}` : ""}
              </Text>
              {!s.is_warmup && isNewPR(we.exercise.id, s) ? (
                <Badge label="PR" color={colors.success} textColor={colors.primaryDark} />
              ) : null}
              {s.source === "device" ? <Badge label="📡" color={colors.surfaceRaised} /> : null}
            </View>
          ))}
        </Card>
      ))}

      <Button title="Done" onPress={() => router.dismissTo("/")} />
    </ScrollView>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent && { color: colors.success }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headline: { color: colors.text, fontSize: 24, fontWeight: "900", marginBottom: spacing.md },
  statRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.sm,
    alignItems: "center",
  },
  statValue: { color: colors.text, fontSize: 16, fontWeight: "900" },
  statLabel: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  notes: { color: colors.textMuted, fontStyle: "italic" },
  exerciseName: { color: colors.text, fontSize: 15, fontWeight: "700", marginBottom: spacing.xs },
  setLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 3 },
  setText: { color: colors.textMuted, fontSize: 13 },
});
