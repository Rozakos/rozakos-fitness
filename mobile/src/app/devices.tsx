import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { useCreateDevice, useDevices, useRevokeDevice } from "@/api/hooks";
import { Button, Card, Input, SectionTitle } from "@/components/ui";
import { colors, radius, spacing } from "@/theme/colors";

export default function Devices() {
  const { data: devices } = useDevices();
  const createDevice = useCreateDevice();
  const revokeDevice = useRevokeDevice();
  const [name, setName] = useState("");
  const [freshKey, setFreshKey] = useState<{ name: string; key: string } | null>(null);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
    >
      <Text style={styles.intro}>
        API keys let embedded devices (a Raspberry Pi rep camera, smart gym gear) log sets and
        stream live reps into your workouts.
      </Text>

      <SectionTitle>New device</SectionTitle>
      <View style={styles.newRow}>
        <Input
          placeholder='Name (e.g. "Garage Raspi")'
          value={name}
          onChangeText={setName}
          style={{ flex: 1 }}
        />
        <Button
          title="Create"
          onPress={() =>
            createDevice.mutate(name.trim(), {
              onSuccess: (device) => {
                setName("");
                if (device.key) setFreshKey({ name: device.name, key: device.key });
              },
            })
          }
          disabled={!name.trim()}
          loading={createDevice.isPending}
        />
      </View>

      {freshKey ? (
        <Card style={{ borderColor: colors.success, borderWidth: 1 }}>
          <Text style={styles.freshTitle}>Key for “{freshKey.name}” — shown only once!</Text>
          <Text style={styles.key} selectable>
            {freshKey.key}
          </Text>
          <View style={styles.newRow}>
            <View style={{ flex: 1 }}>
              <Button
                title="Copy key"
                variant="secondary"
                onPress={async () => {
                  await Clipboard.setStringAsync(freshKey.key);
                  Alert.alert("Copied", "API key copied to clipboard.");
                }}
              />
            </View>
            <Button title="Done" variant="ghost" onPress={() => setFreshKey(null)} />
          </View>
        </Card>
      ) : null}

      <SectionTitle>Your devices</SectionTitle>
      {devices?.length ? (
        devices.map((device) => (
          <Card key={device.id}>
            <View style={styles.deviceRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.deviceName}>{device.name}</Text>
                <Text style={styles.muted}>
                  {device.prefix}…{"  ·  "}
                  {device.last_used_at
                    ? `last used ${new Date(device.last_used_at).toLocaleDateString()}`
                    : "never used"}
                </Text>
              </View>
              <Button
                title="Revoke"
                variant="danger"
                onPress={() =>
                  Alert.alert("Revoke key?", `"${device.name}" will stop working immediately.`, [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Revoke",
                      style: "destructive",
                      onPress: () => revokeDevice.mutate(device.id),
                    },
                  ])
                }
              />
            </View>
          </Card>
        ))
      ) : (
        <Text style={styles.muted}>No devices yet.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  intro: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.sm },
  newRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  freshTitle: { color: colors.success, fontWeight: "700", marginBottom: spacing.xs },
  key: {
    color: colors.text,
    fontFamily: "monospace",
    fontSize: 12,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  deviceRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  deviceName: { color: colors.text, fontSize: 15, fontWeight: "700" },
  muted: { color: colors.textMuted, fontSize: 12 },
});
