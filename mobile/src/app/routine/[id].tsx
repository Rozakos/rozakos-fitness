import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { RoutineExerciseInput, useDeleteRoutine, useRoutines, useSaveRoutine } from "@/api/hooks";
import type { Exercise } from "@/api/types";
import { ExercisePicker } from "@/components/exercise-picker";
import { Button, Card, Input, SectionTitle } from "@/components/ui";
import { colors, spacing } from "@/theme/colors";

interface EditableExercise extends RoutineExerciseInput {
  exercise: Exercise;
}

export default function RoutineEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const router = useRouter();
  const { data: routines } = useRoutines();
  const saveRoutine = useSaveRoutine();
  const deleteRoutine = useDeleteRoutine();

  const [name, setName] = useState("");
  const [items, setItems] = useState<EditableExercise[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loadedId, setLoadedId] = useState<number | null>(null);

  // Seed the editor from the fetched routine as soon as it arrives. Done during
  // render (React's "adjust state when data changes" pattern) rather than in an
  // effect: an effect would commit the empty form first and cascade a second
  // render on top of it. The loadedId guard keeps it to once per routine, so
  // later edits are never clobbered by a background refetch.
  const routine = isNew ? undefined : routines?.find((r) => r.id === Number(id));
  if (routine && loadedId !== routine.id) {
    setLoadedId(routine.id);
    setName(routine.name);
    setItems(
      routine.exercises.map((re) => ({
        exercise: re.exercise,
        exercise_id: re.exercise.id,
        order: re.order,
        superset_group: re.superset_group,
        target_sets: re.target_sets,
        target_reps_min: re.target_reps_min,
        target_reps_max: re.target_reps_max,
      })),
    );
  }

  const updateItem = (index: number, patch: Partial<RoutineExerciseInput>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const move = (index: number, delta: number) => {
    setItems((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((item, i) => ({ ...item, order: i }));
    });
  };

  const save = () => {
    saveRoutine.mutate(
      {
        id: isNew ? undefined : Number(id),
        name: name.trim(),
        exercises: items.map(({ exercise, ...rest }, i) => ({ ...rest, order: i })),
      },
      { onSuccess: () => router.back() },
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
    >
      <Stack.Screen options={{ title: isNew ? "New routine" : "Edit routine" }} />
      <Input placeholder="Routine name (e.g. Push Day A)" value={name} onChangeText={setName} />

      <SectionTitle>Exercises</SectionTitle>
      {items.map((item, index) => (
        <Card key={`${item.exercise_id}-${index}`}>
          <View style={styles.headerRow}>
            <Text style={styles.name}>{item.exercise.name}</Text>
            <View style={styles.iconRow}>
              <Pressable onPress={() => move(index, -1)} hitSlop={6}>
                <Ionicons name="chevron-up" size={18} color={colors.textMuted} />
              </Pressable>
              <Pressable onPress={() => move(index, 1)} hitSlop={6}>
                <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
              </Pressable>
              <Pressable
                onPress={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                hitSlop={6}
              >
                <Ionicons name="trash-outline" size={18} color={colors.textFaint} />
              </Pressable>
            </View>
          </View>
          <View style={styles.targetRow}>
            <Field
              label="Sets"
              value={item.target_sets}
              onChange={(v) => updateItem(index, { target_sets: v })}
            />
            <Field
              label="Reps min"
              value={item.target_reps_min}
              onChange={(v) => updateItem(index, { target_reps_min: v })}
            />
            <Field
              label="Reps max"
              value={item.target_reps_max}
              onChange={(v) => updateItem(index, { target_reps_max: v })}
            />
            <Field
              label="Superset #"
              value={item.superset_group ?? 0}
              onChange={(v) => updateItem(index, { superset_group: v || null })}
            />
          </View>
        </Card>
      ))}

      <Button title="+ Add exercise" variant="secondary" onPress={() => setPickerOpen(true)} />
      <View style={{ height: spacing.md }} />
      <Button
        title="Save routine"
        onPress={save}
        disabled={!name.trim() || items.length === 0}
        loading={saveRoutine.isPending}
      />
      {!isNew ? (
        <>
          <View style={{ height: spacing.sm }} />
          <Button
            title="Delete routine"
            variant="danger"
            onPress={() =>
              deleteRoutine.mutate(Number(id), { onSuccess: () => router.back() })
            }
          />
        </>
      ) : null}

      <ExercisePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(exercise) => {
          setPickerOpen(false);
          setItems((prev) => [
            ...prev,
            {
              exercise,
              exercise_id: exercise.id,
              order: prev.length,
              superset_group: null,
              target_sets: 3,
              target_reps_min: 8,
              target_reps_max: 12,
            },
          ]);
        }}
      />
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Input
        keyboardType="number-pad"
        value={value ? String(value) : ""}
        onChangeText={(t) => onChange(parseInt(t, 10) || 0)}
        style={{ textAlign: "center", paddingVertical: 6 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  iconRow: { flexDirection: "row", gap: spacing.md },
  name: { color: colors.text, fontSize: 15, fontWeight: "700", flex: 1 },
  targetRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  fieldLabel: { color: colors.textFaint, fontSize: 10, marginBottom: 2, textAlign: "center" },
});
