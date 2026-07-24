import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import {
  useBodyweight,
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
  const { data: bodyweightLog } = useBodyweight();
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
  const [addedSign, setAddedSign] = useState<1 | -1>(1);

  // For bodyweight movements the weight box means *added* load, not total: blank
  // is a plain set, positive is a dip belt / weight vest, negative is assistance
  // (band, assisted pull-up machine). The set still stores the real total so
  // volume, PRs and est-1RM stay comparable with loaded lifts. A previous
  // session's total must therefore never be prefilled into the box.
  const isBodyweight = we.exercise.equipment === "bodyweight";
  const bodyweightKg = bodyweightLog?.[0]?.weight_kg ?? null;

  const effectiveWeight = isBodyweight
    ? weight
    : weight ||
      (lastLogged ? String(fromKg(lastLogged.weight_kg, unit)) : "") ||
      (ghost ? String(fromKg(ghost.weight_kg, unit)) : "");
  const effectiveReps = reps || (ghost ? String(ghost.reps) : "");

  // An empty box is 0 added load for bodyweight work, but stays "nothing to log"
  // for loaded lifts with no last-time value to fall back on.
  const enteredWeight =
    effectiveWeight.trim() === ""
      ? isBodyweight
        ? 0
        : NaN
      : parseFloat(effectiveWeight.replace(",", "."));
  const parsedReps = parseInt(effectiveReps, 10);

  // decimal-pad has no minus key, so assistance is entered via the ± toggle.
  const addedKg = isBodyweight ? toKg(enteredWeight * addedSign, unit) : 0;
  const totalKg = isBodyweight
    ? Math.max(0, Math.round(((bodyweightKg ?? 0) + addedKg) * 100) / 100)
    : toKg(enteredWeight, unit);

  // The user must have actually entered something — the ghost/last-time values
  // are a convenience (type just the weight, reuse last reps), never a full set
  // logged from a completely blank row on a stray tap.
  const userEntered = weight.trim() !== "" || reps.trim() !== "";
  // Nothing valid to log yet (e.g. a brand-new exercise with no "last time"
  // ghost to fall back on and an empty reps field). Drives the disabled state of
  // the log button so a tap can't silently no-op.
  const canLog = userEntered && Number.isFinite(enteredWeight) && Number.isFinite(parsedReps);

  const submit = () => {
    if (!canLog) return;
    const r = parsedReps;
    const raw = intensity ? parseFloat(intensity.replace(",", ".")) : null;
    const rpeValue = raw !== null && !Number.isNaN(raw) ? displayToRpe(raw, intensityMode) : null;
    logSet.mutate(
      { workoutId, weId: we.id, weight_kg: totalKg, reps: r, rpe: rpeValue, is_warmup: warmup },
      {
        onSuccess: () => {
          setWeight("");
          setReps("");
          setIntensity("");
          setWarmup(false);
          onSetLogged(we.exercise.rest_seconds_default);
        },
        onError: (err) =>
          Alert.alert("Set not saved", err instanceof Error ? err.message : "Please try again."),
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
        {isBodyweight ? (
          <Pressable
            onPress={() => setAddedSign(addedSign === 1 ? -1 : 1)}
            style={styles.signToggle}
            hitSlop={4}
          >
            <Text
              style={{
                color: addedSign === -1 ? colors.alert : colors.textMuted,
                fontWeight: "800",
              }}
            >
              {addedSign === -1 ? "−" : "+"}
            </Text>
          </Pressable>
        ) : null}
        <Input
          placeholder={isBodyweight ? unit : ghost ? String(fromKg(ghost.weight_kg, unit)) : unit}
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
          disabled={logSet.isPending || !canLog}
          style={[styles.logButton, (logSet.isPending || !canLog) && { opacity: 0.5 }]}
        >
          <Ionicons name="checkmark" size={20} color={colors.text} />
        </Pressable>
      </View>

      {isBodyweight ? (
        <Text style={styles.bodyweightHint}>
          {bodyweightKg == null
            ? "Log your bodyweight in Profile so these sets count toward volume and PRs."
            : `${addedSign === -1 ? "assisted" : "added"} load · logs ${fromKg(totalKg, unit)} ${unit} ` +
              `(bodyweight ${fromKg(bodyweightKg, unit)})`}
        </Text>
      ) : null}

      <PlateCalculator
        visible={platesOpen}
        // a dip belt / weight vest is loaded with the added weight, not the total
        weight={(isBodyweight ? fromKg(Math.abs(addedKg), unit) : parseFloat(effectiveWeight.replace(",", "."))) || 0}
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
  signToggle: {
    width: 24,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  bodyweightHint: { color: colors.textFaint, fontSize: 11, marginTop: spacing.xs },
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
