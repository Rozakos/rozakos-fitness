import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/theme/colors";

function BarButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      <Text style={styles.barButton}>{label}</Text>
    </Pressable>
  );
}

export function RestTimer({
  endsAt,
  onDone,
  onAdjust,
}: {
  endsAt: number;
  onDone: () => void;
  onAdjust: (deltaSeconds: number) => void;
}) {
  const [remaining, setRemaining] = useState(Math.max(0, endsAt - Date.now()));

  useEffect(() => {
    const interval = setInterval(() => {
      const left = endsAt - Date.now();
      setRemaining(Math.max(0, left));
      if (left <= 0) onDone();
    }, 250);
    return () => clearInterval(interval);
  }, [endsAt, onDone]);

  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return (
    <View style={styles.bar}>
      <Text style={styles.label}>REST</Text>
      <Text style={styles.time}>
        {minutes}:{String(seconds).padStart(2, "0")}
      </Text>
      <BarButton label="−30s" onPress={() => onAdjust(-30)} />
      <BarButton label="+30s" onPress={() => onAdjust(30)} />
      <BarButton label="Skip" onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    marginBottom: spacing.sm,
  },
  label: { color: colors.text, fontWeight: "800", letterSpacing: 2 },
  time: { color: colors.text, fontSize: 24, fontWeight: "900", fontVariant: ["tabular-nums"] },
  barButton: { color: colors.text, fontWeight: "700", padding: spacing.xs },
});
