import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import {
  useActiveWorkout,
  useLogBodyweight,
  useStartWorkout,
  useWeeklyVolume,
  useWorkoutHistory,
} from "@/api/hooks";
import { Button, Card, Input, SectionTitle } from "@/components/ui";
import { useAuth } from "@/store/auth";
import { fromKg, toKg, useSettings } from "@/store/settings";
import { colors, spacing } from "@/theme/colors";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function Home() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const { data: active } = useActiveWorkout();
  const { data: history } = useWorkoutHistory(5);
  const { data: volume } = useWeeklyVolume(8);
  const startWorkout = useStartWorkout();
  const logBodyweight = useLogBodyweight();
  const unit = useSettings((s) => s.unit);
  const [bw, setBw] = useState("");

  const thisWeek = volume?.length ? volume[volume.length - 1] : null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.content}>
      <Text style={styles.greeting}>
        Welcome back, <Text style={{ color: colors.accentBright }}>{user?.display_name}</Text>
      </Text>

      <Card>
        {active ? (
          <>
            <Text style={styles.cardTitle}>Workout in progress</Text>
            <Text style={styles.cardSub}>
              Started {new Date(active.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {" · "}
              {active.exercises.length} exercise{active.exercises.length === 1 ? "" : "s"}
            </Text>
            <Button title="Continue workout" onPress={() => router.navigate("/workout")} />
          </>
        ) : (
          <>
            <Text style={styles.cardTitle}>Ready to train?</Text>
            <Button
              title="Start empty workout"
              onPress={() =>
                startWorkout.mutate({}, { onSuccess: () => router.navigate("/workout") })
              }
              loading={startWorkout.isPending}
            />
            <View style={{ height: spacing.sm }} />
            <Button
              title="Start from routine"
              variant="secondary"
              onPress={() => router.navigate("/routines")}
            />
          </>
        )}
      </Card>

      <SectionTitle>This week</SectionTitle>
      <Card>
        <Text style={styles.volumeNumber}>
          {thisWeek
            ? `${Math.round(fromKg(thisWeek.total_volume_kg, unit)).toLocaleString()} ${unit}`
            : "—"}
        </Text>
        <Text style={styles.cardSub}>total volume lifted</Text>
      </Card>

      <SectionTitle>Bodyweight</SectionTitle>
      <Card style={styles.bwRow}>
        <Input
          placeholder={unit}
          keyboardType="decimal-pad"
          value={bw}
          onChangeText={setBw}
          style={{ flex: 1 }}
        />
        <Button
          title="Log"
          variant="secondary"
          onPress={() => {
            const weight = parseFloat(bw.replace(",", "."));
            if (!Number.isNaN(weight) && weight > 0) {
              logBodyweight.mutate(
                { date: new Date().toISOString().slice(0, 10), weight_kg: toKg(weight, unit) },
                { onSuccess: () => setBw("") },
              );
            }
          }}
        />
      </Card>

      <SectionTitle>Recent workouts</SectionTitle>
      {history?.length ? (
        history.map((w) => (
          <Card key={w.id}>
            <Text style={styles.cardTitle}>{formatDate(w.started_at)}</Text>
            {w.notes ? <Text style={styles.cardSub}>{w.notes}</Text> : null}
          </Card>
        ))
      ) : (
        <Text style={styles.cardSub}>No workouts yet — go lift something.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  greeting: { color: colors.text, fontSize: 22, fontWeight: "800", marginBottom: spacing.md },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: spacing.xs },
  cardSub: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.sm },
  volumeNumber: { color: colors.success, fontSize: 28, fontWeight: "900" },
  bwRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
});
