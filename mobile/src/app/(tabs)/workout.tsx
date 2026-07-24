import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  useActiveWorkout,
  useAddWorkoutExercise,
  useDeleteWorkout,
  useFinishWorkout,
  useStartWorkout,
  useUpdateWorkout,
  useUpdateWorkoutExercise,
} from "@/api/hooks";
import { ExercisePicker } from "@/components/exercise-picker";
import { RestTimer } from "@/components/rest-timer";
import { Button, EmptyState, Input, Loading } from "@/components/ui";
import { WorkoutExerciseCard } from "@/components/workout-exercise-card";
import { useWorkoutChannel } from "@/hooks/use-workout-channel";
import { useAuth } from "@/store/auth";
import { colors, spacing } from "@/theme/colors";

export default function WorkoutScreen() {
  const router = useRouter();
  const localMode = useAuth((s) => s.localMode);
  const { data: workout, isLoading } = useActiveWorkout();
  const startWorkout = useStartWorkout();
  const finishWorkout = useFinishWorkout();
  const deleteWorkout = useDeleteWorkout();
  const addExercise = useAddWorkoutExercise();
  const updateWorkout = useUpdateWorkout();
  const updateExercise = useUpdateWorkoutExercise();
  const { liveRep, connected } = useWorkoutChannel(workout?.id);

  // picker either adds a new exercise or swaps the movement of an existing one
  const [pickerTarget, setPickerTarget] = useState<"add" | number | null>(null);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const clearRest = useCallback(() => setRestEndsAt(null), []);
  const adjustRest = useCallback((delta: number) => {
    setRestEndsAt((prev) => {
      if (prev === null) return prev;
      const next = Math.max(Date.now(), prev + delta * 1000);
      return next <= Date.now() ? null : next;
    });
  }, []);

  if (isLoading) return <Loading />;

  if (!workout) {
    return (
      <View style={styles.emptyContainer}>
        <EmptyState
          title="No active workout"
          subtitle="Start fresh or pick a routine to pre-load your exercises."
        />
        <Button
          title="Start empty workout"
          onPress={() => startWorkout.mutate({})}
          loading={startWorkout.isPending}
        />
        <View style={{ height: spacing.sm }} />
        <Button
          title="Choose a routine"
          variant="secondary"
          onPress={() => router.navigate("/routines")}
        />
      </View>
    );
  }

  const confirmFinish = () => {
    const totalSets = workout.exercises.reduce((n, we) => n + we.sets.length, 0);
    if (totalSets === 0) {
      Alert.alert("Discard workout?", "No sets logged — this will delete the session.", [
        { text: "Keep going", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => deleteWorkout.mutate(workout.id),
        },
      ]);
      return;
    }
    finishWorkout.mutate(workout.id, {
      onSuccess: (finished) => router.push(`/workout-summary/${finished.id}`),
    });
  };

  const moveExercise = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= workout.exercises.length) return;
    const a = workout.exercises[index];
    const b = workout.exercises[target];
    updateExercise.mutate({ workoutId: workout.id, weId: a.id, order: target });
    updateExercise.mutate({ workoutId: workout.id, weId: b.id, order: index });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* "handled" is essential here: with the default ("never") the tap that
          dismisses the keyboard is swallowed by the ScrollView, so the first
          press of a set's log button after typing reps/RPE does nothing. */}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <Text style={styles.title}>
            {new Date(workout.started_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            session
          </Text>
          {localMode ? null : (
            <Text style={[styles.wsDot, { color: connected ? colors.success : colors.textFaint }]}>
              ● {connected ? "live" : "offline"}
            </Text>
          )}
        </View>

        {restEndsAt ? (
          <RestTimer endsAt={restEndsAt} onDone={clearRest} onAdjust={adjustRest} />
        ) : null}

        <Input
          placeholder="Session notes (how did it feel?)"
          value={notes ?? workout.notes ?? ""}
          onChangeText={setNotes}
          onEndEditing={() => {
            if (notes !== null && notes !== (workout.notes ?? "")) {
              updateWorkout.mutate({ id: workout.id, notes: notes.trim() || null });
            }
          }}
          multiline
          style={{ marginBottom: spacing.sm }}
        />

        {workout.exercises.map((we, index) => (
          <WorkoutExerciseCard
            key={we.id}
            workoutId={workout.id}
            we={we}
            liveRepCount={
              liveRep && liveRep.exerciseId === we.exercise.id ? liveRep.count : undefined
            }
            onSetLogged={(rest) => setRestEndsAt(Date.now() + rest * 1000)}
            onSwap={() => setPickerTarget(we.id)}
            onMove={(direction) => moveExercise(index, direction)}
          />
        ))}

        <Button title="+ Add exercise" variant="secondary" onPress={() => setPickerTarget("add")} />
        <View style={{ height: spacing.sm }} />
        <Button title="Finish workout" onPress={confirmFinish} loading={finishWorkout.isPending} />
      </ScrollView>

      <ExercisePicker
        visible={pickerTarget !== null}
        onClose={() => setPickerTarget(null)}
        onPick={(exercise) => {
          if (pickerTarget === "add") {
            addExercise.mutate({ workoutId: workout.id, exerciseId: exercise.id });
          } else if (pickerTarget !== null) {
            updateExercise.mutate({
              workoutId: workout.id,
              weId: pickerTarget,
              exercise_id: exercise.id,
            });
          }
          setPickerTarget(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  emptyContainer: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: spacing.lg },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  wsDot: { fontSize: 12, fontWeight: "700" },
});
