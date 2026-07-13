import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, useWindowDimensions } from "react-native";

import { useBodyweight, usePRs, useWeeklyVolume } from "@/api/hooks";
import { LabeledBars, TrendLine, WeeklyBars } from "@/components/charts";
import { Button, Card, SectionTitle } from "@/components/ui";
import { useAuth } from "@/store/auth";
import { colors, spacing } from "@/theme/colors";

export default function Profile() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { width } = useWindowDimensions();
  const { data: volume } = useWeeklyVolume(12);
  const { data: bodyweight } = useBodyweight();
  const { data: prs } = usePRs();

  const chartWidth = width - spacing.md * 4;
  const thisWeek = volume?.length ? volume[volume.length - 1] : null;
  const muscleData = thisWeek
    ? Object.entries(thisWeek.by_muscle_group)
        .sort(([, a], [, b]) => b - a)
        .map(([label, value]) => ({ label, value }))
    : [];
  // bodyweight arrives newest-first; charts read left→right in time
  const bwPoints = (bodyweight ?? []).slice().reverse().map((e) => e.weight_kg);

  const bestPRs = (prs ?? [])
    .map((p) => {
      const best = p.records.reduce((a, b) => (b.weight_kg > a.weight_kg ? b : a));
      return { name: p.exercise.name, best };
    })
    .sort((a, b) => b.best.weight_kg - a.best.weight_kg)
    .slice(0, 5);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
    >
      <Text style={styles.name}>{user?.display_name}</Text>
      <Text style={styles.muted}>{user?.email}</Text>

      <SectionTitle>Weekly volume (12 weeks)</SectionTitle>
      <Card>
        <WeeklyBars values={(volume ?? []).map((w) => w.total_volume_kg)} width={chartWidth} unit=" kg" />
      </Card>

      <SectionTitle>This week by muscle group</SectionTitle>
      <Card>
        <LabeledBars data={muscleData} />
      </Card>

      <SectionTitle>Bodyweight</SectionTitle>
      <Card>
        <TrendLine points={bwPoints} width={chartWidth} unit=" kg" color={colors.chartCrimson} />
      </Card>

      <SectionTitle>Top personal records</SectionTitle>
      <Card>
        {bestPRs.length ? (
          bestPRs.map((pr) => (
            <Text key={pr.name} style={styles.prLine}>
              <Text style={{ color: colors.success, fontWeight: "800" }}>{pr.best.weight_kg} kg</Text>
              {"  "}
              {pr.name} × {pr.best.reps}
            </Text>
          ))
        ) : (
          <Text style={styles.muted}>Lift something heavy first.</Text>
        )}
      </Card>

      <SectionTitle>Devices</SectionTitle>
      <Button
        title="Manage devices & API keys"
        variant="secondary"
        onPress={() => router.navigate("/devices")}
      />
      <Text style={styles.deviceHint}>
        Connect a Raspberry Pi rep counter or other embedded gear via the Rozakos Fitness API.
      </Text>

      <Button title="Log out" variant="danger" onPress={signOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  name: { color: colors.text, fontSize: 24, fontWeight: "900" },
  muted: { color: colors.textMuted, fontSize: 13 },
  prLine: { color: colors.text, fontSize: 14, paddingVertical: 4 },
  deviceHint: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
});
