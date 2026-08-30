import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useExerciseHistory, usePRs } from "@/api/hooks";
import type { Exercise, WorkoutSet } from "@/api/types";
import { ExerciseSetupList } from "@/components/exercise-setup";
import { ExerciseVideoLink } from "@/components/exercise-video";
import { Card } from "@/components/ui";
import {
  formatPerformedOrder,
  fromKg,
  rpeToDisplay,
  useSettings,
  type IntensityMode,
  type WeightUnit,
} from "@/store/settings";
import { colors, radius, spacing } from "@/theme/colors";

const SESSIONS_SHOWN = 5;

function sessionDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function setLine(set: WorkoutSet, unit: WeightUnit, intensityMode: IntensityMode) {
  const intensity = set.rpe != null ? `  @ ${rpeToDisplay(set.rpe, intensityMode)}` : "";
  return `${set.is_warmup ? "W" : set.set_number}   ${fromKg(set.weight_kg, unit)} ${unit} × ${set.reps}${intensity}`;
}

/**
 * Mid-workout reference for one exercise: how the machine is set up, the form
 * video, and what was actually done last time. Everything lives in a scroll view
 * with wrapping text so the sheet survives narrow/tall screens and large system
 * font scales.
 */
export function ExerciseInfoSheet({
  exercise,
  visible,
  onClose,
}: {
  exercise: Exercise;
  visible: boolean;
  onClose: () => void;
}) {
  // only fetched once the sheet is opened — cards would otherwise all fetch on mount
  const { data: history } = useExerciseHistory(visible ? exercise.id : undefined, SESSIONS_SHOWN);
  const { data: prs } = usePRs();
  const { unit, intensityMode } = useSettings();

  const records = prs?.find((p) => p.exercise.id === exercise.id)?.records ?? [];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* swallows taps so pressing inside the sheet never closes it */}
        <Pressable style={styles.sheetWrapper} onPress={() => {}}>
          <Card style={styles.sheet}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>{exercise.name}</Text>
                <Text style={styles.subtitle}>
                  {exercise.muscle_group} · {exercise.equipment} · rest{" "}
                  {exercise.rest_seconds_default}s
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            {/* "handled" or the first tap on Save/Cancel is eaten by the keyboard */}
            <ScrollView
              style={styles.body}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: spacing.sm }}
            >
              {/* first, because at the machine this is what you need before
                  anything else */}
              <Text style={styles.section}>Setup</Text>
              <ExerciseSetupList exercise={exercise} />

              <Text style={styles.section}>How it&apos;s done</Text>
              <ExerciseVideoLink exercise={exercise} />

              <Text style={styles.section}>Personal records</Text>
              {records.length ? (
                records.map((r) => (
                  <View key={r.reps} style={styles.prRow}>
                    <Text style={styles.prReps}>{r.reps} RM</Text>
                    <Text style={styles.prWeight}>
                      {fromKg(r.weight_kg, unit)} {unit}
                    </Text>
                    <Text style={styles.prDate}>{sessionDate(r.date)}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.muted}>No records yet — log a working set.</Text>
              )}

              <Text style={styles.section}>Last sessions</Text>
              {history?.length ? (
                history.map((entry) => (
                  <View key={entry.workout_id} style={styles.session}>
                    <View style={styles.sessionHeader}>
                      <Text style={styles.sessionDate}>{sessionDate(entry.date)}</Text>
                      <Text style={styles.sessionOrder}>
                        {formatPerformedOrder(entry.position, entry.total_exercises)}
                      </Text>
                    </View>
                    {entry.sets.map((set) => (
                      <Text key={set.id} style={styles.setLine}>
                        {setLine(set, unit, intensityMode)}
                        {set.source === "device" ? "  📡" : ""}
                      </Text>
                    ))}
                  </View>
                ))
              ) : (
                <Text style={styles.muted}>First time doing this one.</Text>
              )}
            </ScrollView>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: spacing.md,
  },
  // caps the sheet on tall/narrow screens instead of letting it run edge to edge
  sheetWrapper: { width: "100%", maxWidth: 520, maxHeight: "85%", alignSelf: "center" },
  sheet: { marginBottom: 0, flexShrink: 1 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  headerText: { flex: 1, flexShrink: 1 },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  body: { marginTop: spacing.md, flexGrow: 0 },
  section: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  prRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  prReps: { color: colors.success, fontWeight: "800", fontSize: 13, minWidth: 52 },
  prWeight: { color: colors.text, fontSize: 14, fontWeight: "600", flex: 1 },
  prDate: { color: colors.textFaint, fontSize: 11 },
  session: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: 2,
  },
  sessionDate: { color: colors.text, fontSize: 13, fontWeight: "700" },
  sessionOrder: { color: colors.textFaint, fontSize: 11 },
  setLine: { color: colors.textMuted, fontSize: 13, paddingVertical: 1 },
  muted: { color: colors.textMuted, fontSize: 13 },
});
