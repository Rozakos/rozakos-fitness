import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { useActiveWorkout, useRoutines, useStartWorkout } from "@/api/hooks";
import { Button, Card, EmptyState, ErrorState, Loading } from "@/components/ui";
import { useRefreshControl } from "@/hooks/use-refresh-control";
import { colors, spacing } from "@/theme/colors";

export default function Routines() {
  const router = useRouter();
  const {
    data: routines,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useRoutines();
  const { data: active } = useActiveWorkout();
  const startWorkout = useStartWorkout();
  const refreshControl = useRefreshControl();
  // only the routine actually being started shows a spinner
  const startingId = startWorkout.isPending
    ? startWorkout.variables?.routine_id
    : undefined;

  if (isLoading) return <Loading />;
  // only when there is nothing saved to show; with cached data the list stays up
  if (isError && !routines)
    return <ErrorState onRetry={() => refetch()} retrying={isRefetching} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.md }}>
      {/* One banner instead of "Workout in progress" stamped on every card */}
      {active ? (
        <Pressable
          onPress={() => router.navigate("/workout")}
          style={({ pressed }) => [
            styles.activeBanner,
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
        >
          <Ionicons name="barbell" size={18} color={colors.text} />
          <Text style={styles.activeText}>Workout in progress — continue</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </Pressable>
      ) : null}
      <Button
        title="+ New routine"
        onPress={() => router.navigate("/routine/new")}
      />
      <FlatList
        refreshControl={refreshControl}
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
              {item.exercises.map((e) => e.exercise.name).join(" · ") ||
                "empty"}
            </Text>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Start"
                  onPress={() =>
                    startWorkout.mutate(
                      { routine_id: item.id },
                      { onSuccess: () => router.navigate("/workout") },
                    )
                  }
                  disabled={!!active || startWorkout.isPending}
                  loading={startingId === item.id}
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
  muted: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: "row", gap: spacing.sm },
  activeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    marginBottom: spacing.sm,
  },
  activeText: { color: colors.text, fontWeight: "700", fontSize: 15, flex: 1 },
});
