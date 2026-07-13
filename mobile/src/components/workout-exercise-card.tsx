import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  useDeleteSet,
  useExerciseHistory,
  useLogSet,
  useRemoveWorkoutExercise,
} from "@/api/hooks";
import type { WorkoutExercise, WorkoutSet } from "@/api/types";
import { Badge, Card, Input } from "@/components/ui";
import { colors, spacing } from "@/theme/colors";

function SetRow({
  set,
  workoutId,
  weId,
}: {
  set: WorkoutSet;
  workoutId: number;
  weId: number;
}) {
  const deleteSet = useDeleteSet();
  return (
    <View style={styles.setRow}>
      <Text style={[styles.setNumber, set.is_warmup && { color: colors.textFaint }]}>
        {set.is_warmup ? "W" : set.set_number}
      </Text>
      <Text style={styles.setValue}>{set.weight_kg} kg</Text>
      <Text style={styles.setValue}>× {set.reps}</Text>
      <Text style={styles.setRpe}>{set.rpe != null ? `RPE ${set.rpe}` : ""}</Text>
      {set.source === "device" ? (
        <Badge label="📡" color={colors.surfaceRaised} />
      ) : (
        <View style={{ width: 24 }} />
      )}
      <Pressable
        onPress={() => deleteSet.mutate({ workoutId, weId, setId: set.id })}
        hitSlop={8}
      >
        <Ionicons name="close" size={16} color={colors.textFaint} />
      </Pressable>
    </View>
  );
}

export function WorkoutExerciseCard({
  workoutId,
  we,
  onSetLogged,
  liveRepCount,
}: {
  workoutId: number;
  we: WorkoutExercise;
  onSetLogged: (restSeconds: number) => void;
  liveRepCount?: number;
}) {
  const { data: history } = useExerciseHistory(we.exercise.id, 1);
  const logSet = useLogSet();
  const removeExercise = useRemoveWorkoutExercise();

  const previousSets = history?.[0]?.sets.filter((s) => !s.is_warmup) ?? [];
  const nextIndex = we.sets.filter((s) => !s.is_warmup).length;
  const ghost = previousSets[nextIndex] ?? previousSets[previousSets.length - 1];
  const lastLogged = we.sets[we.sets.length - 1];

  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [rpe, setRpe] = useState("");
  const [warmup, setWarmup] = useState(false);

  const effectiveWeight = weight || (lastLogged ? String(lastLogged.weight_kg) : "") || (ghost ? String(ghost.weight_kg) : "");
  const effectiveReps = reps || (ghost ? String(ghost.reps) : "");

  const submit = () => {
    const w = parseFloat(effectiveWeight.replace(",", "."));
    const r = parseInt(effectiveReps, 10);
    if (Number.isNaN(w) || Number.isNaN(r)) return;
    const rpeValue = rpe ? parseFloat(rpe.replace(",", ".")) : null;
    logSet.mutate(
      { workoutId, weId: we.id, weight_kg: w, reps: r, rpe: rpeValue, is_warmup: warmup },
      {
        onSuccess: () => {
          setWeight("");
          setReps("");
          setRpe("");
          setWarmup(false);
          onSetLogged(we.exercise.rest_seconds_default);
        },
      },
    );
  };

  return (
    <Card>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{we.exercise.name}</Text>
          <Text style={styles.muted}>
            {we.exercise.muscle_group}
            {ghost ? `  ·  last: ${ghost.weight_kg} kg × ${ghost.reps}` : ""}
          </Text>
        </View>
        {we.superset_group != null ? (
          <Badge label={`SS${we.superset_group}`} color={colors.accent} />
        ) : null}
        <Pressable
          onPress={() => removeExercise.mutate({ workoutId, weId: we.id })}
          hitSlop={8}
          style={{ marginLeft: spacing.sm }}
        >
          <Ionicons name="trash-outline" size={18} color={colors.textFaint} />
        </Pressable>
      </View>

      {liveRepCount !== undefined ? (
        <View style={styles.liveBar}>
          <Ionicons name="radio" size={16} color={colors.success} />
          <Text style={styles.liveText}>Device counting… rep {liveRepCount}</Text>
        </View>
      ) : null}

      {we.sets.map((set) => (
        <SetRow key={set.id} set={set} workoutId={workoutId} weId={we.id} />
      ))}

      <View style={styles.inputRow}>
        <Pressable onPress={() => setWarmup(!warmup)} style={styles.warmupToggle} hitSlop={4}>
          <Text style={{ color: warmup ? colors.success : colors.textFaint, fontWeight: "800" }}>
            W
          </Text>
        </Pressable>
        <Input
          placeholder={ghost ? String(ghost.weight_kg) : "kg"}
          keyboardType="decimal-pad"
          value={weight}
          onChangeText={setWeight}
          style={styles.input}
        />
        <Input
          placeholder={ghost ? String(ghost.reps) : "reps"}
          keyboardType="number-pad"
          value={reps}
          onChangeText={setReps}
          style={styles.input}
        />
        <Input
          placeholder="RPE"
          keyboardType="decimal-pad"
          value={rpe}
          onChangeText={setRpe}
          style={[styles.input, { flex: 0.7 }]}
        />
        <Pressable
          onPress={submit}
          disabled={logSet.isPending}
          style={[styles.logButton, logSet.isPending && { opacity: 0.5 }]}
        >
          <Ionicons name="checkmark" size={20} color={colors.text} />
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  name: { color: colors.text, fontSize: 16, fontWeight: "700" },
  muted: { color: colors.textMuted, fontSize: 12 },
  liveBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  liveText: { color: colors.success, fontWeight: "700", fontSize: 13 },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  setNumber: { color: colors.success, fontWeight: "800", width: 20, textAlign: "center" },
  setValue: { color: colors.text, fontSize: 15, minWidth: 64 },
  setRpe: { color: colors.textMuted, fontSize: 12, flex: 1 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.sm },
  warmupToggle: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  input: { flex: 1, paddingVertical: 8, textAlign: "center" },
  logButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
