import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { api } from "@/api/client";
import { ACCOUNT_DELETION_URL, PRIVACY_POLICY_URL, SUPPORT_EMAIL } from "@/api/config";
import { useBodyweight, usePRs, useWeeklyVolume } from "@/api/hooks";
import type { LocalDataImportResult } from "@/api/types";
import { LabeledBars, TrendLine, WeeklyBars } from "@/components/charts";
import { Button, Card, SectionTitle } from "@/components/ui";
import { completeLocalImport, prepareLocalImport } from "@/local/db";
import { useAuth } from "@/store/auth";
import { IntensityMode, WeightUnit, fromKg, useSettings } from "@/store/settings";
import { colors, radius, spacing } from "@/theme/colors";
import { chartWidth } from "@/theme/layout";

export default function Profile() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, localMode, signOut } = useAuth();
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [mergingLocalData, setMergingLocalData] = useState(false);
  const { width } = useWindowDimensions();
  const { data: volume } = useWeeklyVolume(12);
  const { data: bodyweight } = useBodyweight();
  const { data: prs } = usePRs();
  const { unit, setUnit, intensityMode, setIntensityMode } = useSettings();

  // screen padding + card padding, both sides; floored so a folded cover
  // display or a split-screen window never asks for a negative canvas
  const chartW = chartWidth(width, spacing.md * 4);
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

  const deleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await api<void>("/auth/account", { method: "DELETE" });
      await signOut();
    } catch (error) {
      Alert.alert(
        "Account not deleted",
        error instanceof Error ? error.message : "Please try again.",
      );
      setDeletingAccount(false);
    }
  };

  const confirmAccountDeletion = () => {
    Alert.alert(
      "Permanently delete account?",
      "This deletes your workout history, routines, bodyweight entries, custom exercises, and device keys. It cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete account", style: "destructive", onPress: () => void deleteAccount() },
      ],
    );
  };

  const mergeLocalData = async () => {
    if (user === null) return;
    const accountIdentity = `${user.id}:${user.email.toLowerCase()}`;
    const payload = prepareLocalImport(user.id, accountIdentity);
    if (payload === null) {
      Alert.alert(
        "No local data to copy",
        "This phone has no local-only history, or its history was already copied to this account.",
      );
      return;
    }
    setMergingLocalData(true);
    try {
      const result = await api<LocalDataImportResult>("/sync/import-local", {
        method: "POST",
        body: payload,
      });
      completeLocalImport(user.id, payload.import_id, accountIdentity);
      await queryClient.invalidateQueries();
      Alert.alert(
        result.already_imported ? "Local data already copied" : "Local data copied",
        `${result.workouts} workouts, ${result.sets} sets, ${result.routines} routines, and ${result.bodyweight} bodyweight entries are in this account. The original on-phone data was kept.`,
      );
    } catch (error) {
      Alert.alert(
        "Local data not copied",
        error instanceof Error ? error.message : "Please try again while connected.",
      );
    } finally {
      setMergingLocalData(false);
    }
  };

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
      {/* Four chips on one line came to ~328dp — exactly the usable width of a
          360dp phone (Z Flip3), so it clipped at any system font scale above
          1.0. Two labelled groups also say what each pair actually switches. */}
      <Card style={styles.settingsCard}>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Weight</Text>
          <View style={styles.chipGroup}>
            {(["kg", "lb"] as WeightUnit[]).map((u) => (
              <Pressable
                key={u}
                onPress={() => setUnit(u)}
                style={[styles.unitChip, u === unit && { backgroundColor: colors.accent }]}
              >
                <Text style={styles.unitText} maxFontSizeMultiplier={1.3}>
                  {u}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Intensity</Text>
          <View style={styles.chipGroup}>
            {(["rpe", "rir"] as IntensityMode[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => setIntensityMode(m)}
                style={[styles.unitChip, m === intensityMode && { backgroundColor: colors.accent }]}
              >
                <Text style={styles.unitText} maxFontSizeMultiplier={1.3}>
                  {m.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Card>

      <SectionTitle>Weekly volume (12 weeks)</SectionTitle>
      <Card>
        <WeeklyBars
          values={(volume ?? []).map((w) => fromKg(w.total_volume_kg, unit))}
          width={chartW}
          unit={` ${unit}`}
        />
      </Card>

      <SectionTitle>This week by muscle group</SectionTitle>
      <Card>
        <LabeledBars data={muscleData} />
      </Card>

      <SectionTitle>Bodyweight</SectionTitle>
      <Card>
        <TrendLine points={bwPoints} width={chartW} unit={` ${unit}`} color={colors.chartCrimson} />
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

      {!localMode ? (
        <>
          <SectionTitle>Local & cloud data</SectionTitle>
          <Button
            title="Copy local-only data to this account"
            variant="secondary"
            loading={mergingLocalData}
            disabled={deletingAccount}
            onPress={() => void mergeLocalData()}
          />
          <Text style={styles.deviceHint}>
            Merges history previously recorded without an account. Existing cloud values win
            conflicts, retries cannot duplicate data, and the original phone copy is kept. Account
            screens also keep their latest cloud results on this phone for offline viewing.
          </Text>
        </>
      ) : null}

      <SectionTitle>Account</SectionTitle>
      <View style={styles.accountActions}>
        {!localMode ? (
          <Button
            title="Delete account and data"
            variant="danger"
            loading={deletingAccount}
            onPress={confirmAccountDeletion}
          />
        ) : null}
        <Button
          title={localMode ? "Exit local mode" : "Log out"}
          variant={localMode ? "danger" : "secondary"}
          disabled={deletingAccount}
          onPress={() => void signOut()}
        />
      </View>
      {localMode ? (
        <Text style={styles.deviceHint}>
          Exiting keeps your data on this phone — come back to local mode any time.
        </Text>
      ) : null}

      <SectionTitle>Privacy & support</SectionTitle>
      <View style={styles.accountActions}>
        <Button
          title="Privacy Policy"
          variant="secondary"
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
        />
        {!localMode ? (
          <Button
            title="Account deletion webpage"
            variant="secondary"
            onPress={() => void Linking.openURL(ACCOUNT_DELETION_URL)}
          />
        ) : null}
        <Button
          title="Contact support"
          variant="ghost"
          onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  accountActions: { gap: spacing.sm },
  settingsCard: { gap: spacing.sm },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    rowGap: spacing.xs,
  },
  settingLabel: { color: colors.textMuted, fontSize: 14, flexGrow: 1, flexShrink: 1 },
  chipGroup: { flexDirection: "row", gap: spacing.sm },
  // minWidth rather than wide padding, so "kg" and "RPE" are the same size
  unitChip: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    minWidth: 60,
    alignItems: "center",
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
