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
import { PlateCalculator } from "@/components/plate-calculator";
import { Badge, Card, Input } from "@/components/ui";
import { displayToRpe, fromKg, rpeToDisplay, toKg, useSettings } from "@/store/settings";
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
  const { unit, intensityMode } = useSettings();
  return (
    <View style={styles.setRow}>
      <Text style={[styles.setNumber, set.is_warmup && { color: colors.textFaint }]}>
        {set.is_warmup ? "W" : set.set_number}
      </Text>
      <Text style={styles.setValue}>
        {fromKg(set.weight_kg, unit)} {unit}
      </Text>
      <Text style={styles.setValue}>× {set.reps}</Text>
      <Text style={styles.setRpe}>
        {set.rpe != null ? rpeToDisplay(set.rpe, intensityMode) : ""}
      </Text>
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
  onSwap,
  onMove,
  liveRepCount,
}: {
  workoutId: number;
  we: WorkoutExercise;
  onSetLogged: (restSeconds: number) => void;
  onSwap: () => void;
  onMove: (direction: -1 | 1) => void;
  liveRepCount?: number;
}) {
  const { data: history } = useExerciseHistory(we.exercise.id, 1);
  const logSet = useLogSet();
  const removeExercise = useRemoveWorkoutExercise();
  const { unit, intensityMode } = useSettings();

  const previousSets = history?.[0]?.sets.filter((s) => !s.is_warmup) ?? [];
  const nextIndex = we.sets.filter((s) => !s.is_warmup).length;
  const ghost = previousSets[nextIndex] ?? previousSets[previousSets.length - 1];
  const lastLogged = we.sets[we.sets.length - 1];

  // double progression: every working set last session reached the top of the rep range
  const hitTargetLastTime =
    we.target_reps_max != null &&
    previousSets.length > 0 &&
    previousSets.every((s) => s.reps >= we.target_reps_max!);

  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [intensity, setIntensity] = useState("");
  const [warmup, setWarmup] = useState(false);
  const [platesOpen, setPlatesOpen] = useState(false);

  const effectiveWeight =
    weight ||
    (lastLogged ? String(fromKg(lastLogged.weight_kg, unit)) : "") ||
    (ghost ? String(fromKg(ghost.weight_kg, unit)) : "");
  const effectiveReps = reps || (ghost ? String(ghost.reps) : "");

  const submit = () => {
    const w = parseFloat(effectiveWeight.replace(",", "."));
    const r = parseInt(effectiveReps, 10);
    if (Number.isNaN(w) || Number.isNaN(r)) return;
    const raw = intensity ? parseFloat(intensity.replace(",", ".")) : null;
    const rpeValue = raw !== null && !Number.isNaN(raw) ? displayToRpe(raw, intensityMode) : null;
    logSet.mutate(
      { workoutId, weId: we.id, weight_kg: toKg(w, unit), reps: r, rpe: rpeValue, is_warmup: warmup },
      {
        onSuccess: () => {
          setWeight("");
          setReps("");
          setIntensity("");
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
            {we.target_reps_min != null && we.target_reps_max != null
              ? `  ·  target ${we.target_reps_min}–${we.target_reps_max} reps`
              : ""}
            {ghost ? `  ·  last: ${fromKg(ghost.weight_kg, unit)} ${unit} × ${ghost.reps}` : ""}
          </Text>
        </View>
        {we.superset_group != null ? (
          <Badge label={`SS${we.superset_group}`} color={colors.accent} />
        ) : null}
        <View style={styles.headerActions}>
          <Pressable onPress={() => onMove(-1)} hitSlop={6}>
            <Ionicons name="chevron-up" size={18} color={colors.textMuted} />
          </Pressable>
          <Pressable onPress={() => onMove(1)} hitSlop={6}>
            <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
          </Pressable>
          <Pressable onPress={onSwap} hitSlop={6}>
            <Ionicons name="swap-horizontal" size={18} color={colors.textMuted} />
          </Pressable>
          <Pressable onPress={() => removeExercise.mutate({ workoutId, weId: we.id })} hitSlop={6}>
            <Ionicons name="trash-outline" size={18} color={colors.textFaint} />
          </Pressable>
        </View>
      </View>

      {hitTargetLastTime ? (
        <View style={styles.hintBar}>
          <Ionicons name="trending-up" size={14} color={colors.success} />
          <Text style={styles.hintText}>
            All sets hit the top of the range last time — add weight!
          </Text>
        </View>
      ) : null}

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
          placeholder={ghost ? String(fromKg(ghost.weight_kg, unit)) : unit}
          keyboardType="decimal-pad"
          value={weight}
          onChangeText={setWeight}
          style={styles.input}
        />
        <Pressable
          onPress={() => setPlatesOpen(true)}
          hitSlop={4}
          disabled={!effectiveWeight}
          style={{ opacity: effectiveWeight ? 1 : 0.4 }}
        >
          <Ionicons name="disc-outline" size={20} color={colors.textMuted} />
        </Pressable>
        <Input
          placeholder={ghost ? String(ghost.reps) : "reps"}
          keyboardType="number-pad"
          value={reps}
          onChangeText={setReps}
          style={styles.input}
        />
        <Input
          placeholder={intensityMode.toUpperCase()}
          keyboardType="decimal-pad"
          value={intensity}
          onChangeText={setIntensity}
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

      <PlateCalculator
        visible={platesOpen}
        weight={parseFloat(effectiveWeight.replace(",", ".")) || 0}
        unit={unit}
        onClose={() => setPlatesOpen(false)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  headerActions: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    marginLeft: spacing.sm,
  },
  name: { color: colors.text, fontSize: 16, fontWeight: "700" },
  muted: { color: colors.textMuted, fontSize: 12 },
  hintBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  hintText: { color: colors.success, fontSize: 12, fontWeight: "700" },
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
