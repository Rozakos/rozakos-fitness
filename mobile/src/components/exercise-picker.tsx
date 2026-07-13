import { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useCreateExercise, useExercises } from "@/api/hooks";
import type { Exercise } from "@/api/types";
import { Button, Input } from "@/components/ui";
import { colors, radius, spacing } from "@/theme/colors";

const MUSCLE_GROUPS = [
  "chest", "back", "shoulders", "biceps", "triceps",
  "quads", "hamstrings", "glutes", "calves", "core",
];

export function ExercisePicker({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
}) {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newMuscle, setNewMuscle] = useState("chest");
  const { data: exercises } = useExercises(search || undefined);
  const createExercise = useCreateExercise();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Pick exercise</Text>
          <Button title="Close" variant="ghost" onPress={onClose} />
        </View>
        <Input placeholder="Search exercises..." value={search} onChangeText={setSearch} />

        {creating ? (
          <View style={styles.createBox}>
            <Text style={styles.muted}>Muscle group</Text>
            <View style={styles.chips}>
              {MUSCLE_GROUPS.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setNewMuscle(m)}
                  style={[styles.chip, m === newMuscle && { backgroundColor: colors.accent }]}
                >
                  <Text style={styles.chipText}>{m}</Text>
                </Pressable>
              ))}
            </View>
            <Button
              title={`Create "${search}"`}
              onPress={() =>
                createExercise.mutate(
                  { name: search.trim(), muscle_group: newMuscle, equipment: "other" },
                  {
                    onSuccess: (exercise) => {
                      setCreating(false);
                      setSearch("");
                      onPick(exercise);
                    },
                  },
                )
              }
              loading={createExercise.isPending}
              disabled={!search.trim()}
            />
          </View>
        ) : null}

        <FlatList
          data={exercises ?? []}
          keyExtractor={(e) => String(e.id)}
          contentContainerStyle={{ paddingVertical: spacing.sm }}
          ListEmptyComponent={
            <Text style={[styles.muted, { textAlign: "center", marginTop: spacing.lg }]}>
              No matches.
            </Text>
          }
          ListFooterComponent={
            search.trim() && !creating ? (
              <Button
                title={`+ Create custom "${search.trim()}"`}
                variant="ghost"
                onPress={() => setCreating(true)}
              />
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => onPick(item)}>
              <View>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.muted}>
                  {item.muscle_group} · {item.equipment}
                  {item.is_custom ? " · custom" : ""}
                </Text>
              </View>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.md, paddingTop: spacing.xl },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: "800" },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  name: { color: colors.text, fontSize: 15, fontWeight: "600" },
  muted: { color: colors.textMuted, fontSize: 12 },
  createBox: { gap: spacing.sm, marginTop: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { color: colors.text, fontSize: 12 },
});
