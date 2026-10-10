import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  useActiveWorkout,
  useLogBodyweight,
  useRecentWeeks,
  useStartWorkout,
  useWorkoutHistory,
} from "@/api/hooks";
import { MiniBars } from "@/components/charts";
import { Button, Card, Input, SectionTitle } from "@/components/ui";
import { useRefreshControl } from "@/hooks/use-refresh-control";
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

function formatDuration(startedAt: string, finishedAt: string | null) {
  if (!finishedAt) return null;
  const minutes = Math.round(
    (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60000,
  );
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function Home() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const { data: active } = useActiveWorkout();
  const { data: history } = useWorkoutHistory(5);
  const { data: weeks } = useRecentWeeks(8);
  const startWorkout = useStartWorkout();
  const logBodyweight = useLogBodyweight();
  const unit = useSettings((s) => s.unit);
  const [bw, setBw] = useState("");
  const refreshControl = useRefreshControl();

  // `weeks` always ends with the current week (zero if nothing logged yet), so
  // these are this week and last week — not merely the two latest with data
  const thisWeek = weeks?.[weeks.length - 1]?.total_volume_kg ?? null;
  const lastWeek = weeks?.[weeks.length - 2]?.total_volume_kg ?? null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={styles.content}
      // the bodyweight box lives here: without "handled" the first tap on Log
      // after typing a weight is swallowed dismissing the keyboard
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
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
      <Card style={styles.weekCard}>
        <View style={styles.weekText}>
          <Text style={styles.volumeNumber}>
            {thisWeek !== null
              ? `${Math.round(fromKg(thisWeek, unit)).toLocaleString()} ${unit}`
              : "—"}
          </Text>
          <Text style={styles.cardSub}>total volume lifted</Text>
          {/* the absolute figure, not a percentage: a week in progress would
              read as "▼ 100%" every Monday morning */}
          {lastWeek ? (
            <Text style={styles.weekChange}>
              last week {Math.round(fromKg(lastWeek, unit)).toLocaleString()} {unit}
            </Text>
          ) : null}
        </View>
        {weeks ? (
          <View accessibilityLabel="Volume over the last 8 weeks">
            <MiniBars values={weeks.map((w) => w.total_volume_kg)} />
            <Text style={styles.weekAxis}>8 wk</Text>
          </View>
        ) : null}
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
        history.map((w) => {
          const duration = formatDuration(w.started_at, w.finished_at);
          return (
            // these were dead cards before — the summary screen they open is
            // the only place the session's sets and PRs can be read back
            <Pressable
              key={w.id}
              onPress={() => router.navigate(`/workout-summary/${w.id}`)}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <Card style={styles.historyCard}>
                <View style={styles.historyText}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {w.routine_name ?? formatDate(w.started_at)}
                  </Text>
                  <Text style={styles.historyMeta}>
                    {[
                      w.routine_name ? formatDate(w.started_at) : null,
                      w.finished_at ? (duration ?? "finished") : "unfinished",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  <View style={styles.historyStats}>
                    <Text style={styles.historyStat}>
                      {w.exercise_count} exercise{w.exercise_count === 1 ? "" : "s"}
                    </Text>
                    <Text style={styles.historyStat}>
                      {w.set_count} set{w.set_count === 1 ? "" : "s"}
                    </Text>
                    <Text style={styles.historyStat}>
                      {Math.round(fromKg(w.volume_kg, unit)).toLocaleString()} {unit}
                    </Text>
                  </View>
                  {w.notes ? (
                    <Text style={styles.historyNotes} numberOfLines={2}>
                      {w.notes}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
              </Card>
            </Pressable>
          );
        })
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
  weekCard: { flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap", gap: spacing.md },
  weekText: { flex: 1, minWidth: 150 },
  weekChange: { color: colors.textFaint, fontSize: 12, fontWeight: "600" },
  weekAxis: { color: colors.textFaint, fontSize: 10, textAlign: "right", marginTop: 2 },
  bwRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  historyCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  historyText: { flex: 1, flexShrink: 1 },
  historyMeta: { color: colors.textFaint, fontSize: 12 },
  historyStats: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.md, marginTop: spacing.xs },
  historyStat: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  historyNotes: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
});
