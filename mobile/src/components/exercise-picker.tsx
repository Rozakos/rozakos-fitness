import { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { useCreateExercise, useExercises } from "@/api/hooks";
import type { Exercise } from "@/api/types";
import { Button, Input } from "@/components/ui";
import { colors, radius, spacing } from "@/theme/colors";

import { MUSCLE_GROUPS } from "@/local/catalog";

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
    // A Modal renders in its own native window, outside the root provider's
    // view, so it carries its own SafeAreaProvider — without one the insets
    // read as zero and, under Android edge-to-edge, the title sits under the
    // status bar while the last result hides behind the gesture bar.
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
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
            // otherwise the first tap on a result only dismisses the search keyboard
            keyboardShouldPersistTaps="handled"
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
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // padding on top of the SafeAreaView's insets, not instead of them
  // SafeAreaView adds each edge's inset on top of the padding declared here
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
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
