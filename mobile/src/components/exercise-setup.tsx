import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { useSetExerciseSetup } from "@/api/hooks";
import type { Exercise, ExerciseSetupEntry } from "@/api/types";
import { Button, Input } from "@/components/ui";
import { colors, radius, spacing } from "@/theme/colors";

/** Matches MAX_SETUP_ENTRIES in backend/app/schemas.py. */
const MAX_ROWS = 12;

/** Rows need a key that survives editing the label, so it cannot be the label. */
interface DraftRow extends ExerciseSetupEntry {
  key: number;
}

let nextKey = 0;
function toDraft(rows: ExerciseSetupEntry[]): DraftRow[] {
  return rows.map((row) => ({ ...row, key: nextKey++ }));
}

/**
 * The machine settings to dial in before the first set — seat height 4, back pad
 * 2, wide handle. Read mode is a plain label/value table so it can be scanned in
 * one glance standing at the machine; editing swaps in a row of inputs and saves
 * the whole list at once, which is what `PATCH /exercises/{id}` expects.
 *
 * Laid out as a full-width stack for the same reason as `ExerciseVideoLink`: it
 * has to survive a narrow phone and a large system font scale.
 */
export function ExerciseSetupList({ exercise }: { exercise: Exercise }) {
  const setSetup = useSetExerciseSetup();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftRow[]>([]);

  const startEditing = () => {
    // an exercise with nothing recorded opens on one blank row, so the first tap
    // after "Add setup" is already in a text field
    setDraft(exercise.setup.length ? toDraft(exercise.setup) : toDraft([{ label: "", value: "" }]));
    setEditing(true);
  };

  const updateRow = (key: number, field: "label" | "value", text: string) =>
    setDraft((rows) => rows.map((row) => (row.key === key ? { ...row, [field]: text } : row)));

  const removeRow = (key: number) => setDraft((rows) => rows.filter((row) => row.key !== key));

  const addRow = () => setDraft((rows) => [...rows, ...toDraft([{ label: "", value: "" }])]);

  const save = () => {
    const trimmed = draft.map((row) => ({ label: row.label.trim(), value: row.value.trim() }));
    // a row the user added and never filled in is dropped rather than rejected
    const filled = trimmed.filter((row) => row.label || row.value);
    if (filled.some((row) => !row.label || !row.value)) {
      Alert.alert("Finish the row", "Every setting needs both a name and a value.");
      return;
    }
    setSetup.mutate(
      { id: exercise.id, setup: filled },
      {
        onSuccess: () => setEditing(false),
        onError: (err) =>
          Alert.alert("Setup not saved", err instanceof Error ? err.message : "Please try again."),
      },
    );
  };

  if (editing) {
    return (
      <View style={styles.stack}>
        <Text style={styles.hint}>
          Whatever the machine reads — a number, a hole, a colour. Left blank rows are dropped.
        </Text>
        {draft.map((row) => (
          <View key={row.key} style={styles.editRow}>
            <Input
              placeholder="Seat height"
              value={row.label}
              onChangeText={(text) => updateRow(row.key, "label", text)}
              maxLength={40}
              style={styles.labelInput}
            />
            <Input
              placeholder="4"
              value={row.value}
              onChangeText={(text) => updateRow(row.key, "value", text)}
              maxLength={40}
              style={styles.valueInput}
            />
            <Pressable onPress={() => removeRow(row.key)} hitSlop={8}>
              <Ionicons name="close" size={18} color={colors.textFaint} />
            </Pressable>
          </View>
        ))}
        {draft.length < MAX_ROWS ? (
          <Pressable onPress={addRow} hitSlop={8} style={styles.addRow}>
            <Text style={styles.linkAction}>＋ Add another setting</Text>
          </Pressable>
        ) : (
          <Text style={styles.hint}>That&apos;s the {MAX_ROWS}-setting limit.</Text>
        )}
        <Button title="Save setup" onPress={save} loading={setSetup.isPending} />
        <Button title="Cancel" variant="ghost" onPress={() => setEditing(false)} />
      </View>
    );
  }

  if (!exercise.setup.length) {
    return (
      <View style={styles.stack}>
        <Button title="＋ Add machine setup" variant="secondary" onPress={startEditing} />
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      {exercise.setup.map((row, index) => (
        // labels are not deduped server-side, so the index has to be part of the key
        <View key={`${row.label}-${index}`} style={styles.readRow}>
          <Text style={styles.readLabel}>{row.label}</Text>
          <Text style={styles.readValue}>{row.value}</Text>
        </View>
      ))}
      <Pressable onPress={startEditing} hitSlop={8} style={styles.addRow}>
        <Text style={styles.linkAction}>Edit setup</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.xs },
  hint: { color: colors.textMuted, fontSize: 12 },
  readRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
  },
  // the label gives way first so a long value is never the part that truncates
  readLabel: { color: colors.textMuted, fontSize: 13, flexShrink: 1, flexGrow: 1 },
  readValue: { color: colors.text, fontSize: 16, fontWeight: "800", flexShrink: 0 },
  editRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  labelInput: { flex: 1.6, paddingVertical: 8 },
  valueInput: { flex: 1, paddingVertical: 8, textAlign: "center" },
  addRow: { paddingVertical: spacing.xs },
  linkAction: { color: colors.accentBright, fontSize: 13, fontWeight: "700" },
});
