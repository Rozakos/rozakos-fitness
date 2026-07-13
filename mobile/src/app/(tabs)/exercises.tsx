import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";

import { useExercises } from "@/api/hooks";
import { Input, Loading } from "@/components/ui";
import { colors, radius, spacing } from "@/theme/colors";

export default function Exercises() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const { data: exercises, isLoading } = useExercises(search || undefined);

  if (isLoading) return <Loading />;

  const groups = new Map<string, typeof exercises>();
  for (const exercise of exercises ?? []) {
    const list = groups.get(exercise.muscle_group) ?? [];
    list.push(exercise);
    groups.set(exercise.muscle_group, list);
  }
  const sections = [...groups.entries()].map(([title, data]) => ({ title, data: data ?? [] }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.md }}>
      <Input placeholder="Search exercises..." value={search} onChangeText={setSearch} />
      <SectionList
        sections={sections}
        keyExtractor={(e) => String(e.id)}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingVertical: spacing.sm }}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.navigate(`/exercise/${item.id}`)}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.muted}>
              {item.equipment}
              {item.is_custom ? " · custom" : ""}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    color: colors.accentBright,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.xs,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: { color: colors.text, fontSize: 15, fontWeight: "600", flex: 1 },
  muted: { color: colors.textFaint, fontSize: 12 },
});
