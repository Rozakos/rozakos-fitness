import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui";
import { colors, spacing } from "@/theme/colors";

export function RestTimer({ endsAt, onDone }: { endsAt: number; onDone: () => void }) {
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
      <Button title="Skip" variant="ghost" onPress={onDone} />
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
});
