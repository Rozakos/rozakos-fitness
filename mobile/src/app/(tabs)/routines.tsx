import { useRouter } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { useActiveWorkout, useRoutines, useStartWorkout } from "@/api/hooks";
import { Button, Card, EmptyState, Loading } from "@/components/ui";
import { colors, spacing } from "@/theme/colors";

export default function Routines() {
  const router = useRouter();
  const { data: routines, isLoading } = useRoutines();
  const { data: active } = useActiveWorkout();
  const startWorkout = useStartWorkout();

  if (isLoading) return <Loading />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.md }}>
      <Button title="+ New routine" onPress={() => router.navigate("/routine/new")} />
      <FlatList
        data={routines ?? []}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={{ paddingVertical: spacing.md }}
        ListEmptyComponent={
          <EmptyState
            title="No routines yet"
            subtitle='Create a template like "Push Day A" and start workouts from it with one tap.'
          />
        }
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.muted}>
              {item.exercises.map((e) => e.exercise.name).join(" · ") || "empty"}
            </Text>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button
                  title={active ? "Workout in progress" : "Start"}
                  onPress={() =>
                    startWorkout.mutate(
                      { routine_id: item.id },
                      { onSuccess: () => router.navigate("/workout") },
                    )
                  }
                  disabled={!!active}
                  loading={startWorkout.isPending}
                />
              </View>
              <Button
                title="Edit"
                variant="secondary"
                onPress={() => router.navigate(`/routine/${item.id}`)}
              />
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  name: { color: colors.text, fontSize: 17, fontWeight: "700" },
  muted: { color: colors.textMuted, fontSize: 12, marginTop: 2, marginBottom: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm },
});
