import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";

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
import { SessionBar } from "@/components/session-bar";
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
  const [rest, setRest] = useState<{ endsAt: number; durationMs: number } | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const clearRest = useCallback(() => setRest(null), []);
  const adjustRest = useCallback((delta: number) => {
    // read the clock here, not inside the updater — updaters must stay pure
    const now = Date.now();
    setRest((prev) => {
      if (prev === null) return prev;
      const endsAt = Math.max(now, prev.endsAt + delta * 1000);
      return endsAt <= now ? null : { ...prev, endsAt };
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
      {/* Outside the ScrollView on purpose: the rest timer used to scroll away
          with the list, out of sight by the third exercise. */}
      <SessionBar workout={workout} deviceConnected={!localMode && connected}>
        {rest ? (
          <RestTimer
            endsAt={rest.endsAt}
            durationMs={rest.durationMs}
            onDone={clearRest}
            onAdjust={adjustRest}
          />
        ) : null}
      </SessionBar>

      {/* "handled" is essential here: with the default ("never") the tap that
          dismisses the keyboard is swallowed by the ScrollView, so the first
          press of a set's log button after typing reps/RPE does nothing. */}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
            onSetLogged={(seconds) =>
              setRest({ endsAt: Date.now() + seconds * 1000, durationMs: seconds * 1000 })
            }
            onSwap={() => setPickerTarget(we.id)}
            onMove={(direction) => moveExercise(index, direction)}
            isFirst={index === 0}
            isLast={index === workout.exercises.length - 1}
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
});
