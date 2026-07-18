import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { useBodyweight, usePRs, useWeeklyVolume } from "@/api/hooks";
import { LabeledBars, TrendLine, WeeklyBars } from "@/components/charts";
import { Button, Card, SectionTitle } from "@/components/ui";
import { useAuth } from "@/store/auth";
import { IntensityMode, WeightUnit, fromKg, useSettings } from "@/store/settings";
import { colors, radius, spacing } from "@/theme/colors";

export default function Profile() {
  const router = useRouter();
  const { user, localMode, signOut } = useAuth();
  const { width } = useWindowDimensions();
  const { data: volume } = useWeeklyVolume(12);
  const { data: bodyweight } = useBodyweight();
  const { data: prs } = usePRs();
  const { unit, setUnit, intensityMode, setIntensityMode } = useSettings();

  const chartWidth = width - spacing.md * 4;
  const thisWeek = volume?.length ? volume[volume.length - 1] : null;
  const muscleData = thisWeek
    ? Object.entries(thisWeek.by_muscle_group)
        .sort(([, a], [, b]) => b - a)
        .map(([label, value]) => ({ label, value: fromKg(value, unit) }))
    : [];
  // bodyweight arrives newest-first; charts read left→right in time
  const bwPoints = (bodyweight ?? []).slice().reverse().map((e) => fromKg(e.weight_kg, unit));

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
      <Text style={styles.name}>{localMode ? "Local mode" : user?.display_name}</Text>
      <Text style={styles.muted}>
        {localMode ? "No account — data stays on this phone" : user?.email}
      </Text>

      <SectionTitle>Settings</SectionTitle>
      <View style={styles.unitRow}>
        {(["kg", "lb"] as WeightUnit[]).map((u) => (
          <Pressable
            key={u}
            onPress={() => setUnit(u)}
            style={[styles.unitChip, u === unit && { backgroundColor: colors.accent }]}
          >
            <Text style={styles.unitText}>{u}</Text>
          </Pressable>
        ))}
        <View style={{ width: spacing.md }} />
        {(["rpe", "rir"] as IntensityMode[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => setIntensityMode(m)}
            style={[styles.unitChip, m === intensityMode && { backgroundColor: colors.accent }]}
          >
            <Text style={styles.unitText}>{m.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle>Weekly volume (12 weeks)</SectionTitle>
      <Card>
        <WeeklyBars
          values={(volume ?? []).map((w) => fromKg(w.total_volume_kg, unit))}
          width={chartWidth}
          unit={` ${unit}`}
        />
      </Card>

      <SectionTitle>This week by muscle group</SectionTitle>
      <Card>
        <LabeledBars data={muscleData} />
      </Card>

      <SectionTitle>Bodyweight</SectionTitle>
      <Card>
        <TrendLine points={bwPoints} width={chartWidth} unit={` ${unit}`} color={colors.chartCrimson} />
      </Card>

      <SectionTitle>Top personal records</SectionTitle>
      <Card>
        {bestPRs.length ? (
          bestPRs.map((pr) => (
            <Text key={pr.name} style={styles.prLine}>
              <Text style={{ color: colors.success, fontWeight: "800" }}>
                {fromKg(pr.best.weight_kg, unit)} {unit}
              </Text>
              {"  "}
              {pr.name} × {pr.best.reps}
            </Text>
          ))
        ) : (
          <Text style={styles.muted}>Lift something heavy first.</Text>
        )}
      </Card>

      <SectionTitle>Devices</SectionTitle>
      {localMode ? (
        <Text style={styles.deviceHint}>
          Embedded devices (like a Raspberry Pi rep counter) stream sets through the Rozakos
          Fitness server, so they need an account. Local mode is on-phone only.
        </Text>
      ) : (
        <>
          <Button
            title="Manage devices & API keys"
            variant="secondary"
            onPress={() => router.navigate("/devices")}
          />
          <Text style={styles.deviceHint}>
            Connect a Raspberry Pi rep counter or other embedded gear via the Rozakos Fitness API.
          </Text>
        </>
      )}

      <Button
        title={localMode ? "Exit local mode" : "Log out"}
        variant="danger"
        onPress={signOut}
      />
      {localMode ? (
        <Text style={styles.deviceHint}>
          Exiting keeps your data on this phone — come back to local mode any time.
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  unitRow: { flexDirection: "row", gap: spacing.sm },
  unitChip: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
  },
  unitText: { color: colors.text, fontWeight: "800" },
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
