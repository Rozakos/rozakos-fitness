import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/theme/colors";

function BarButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      <Text style={styles.barButton} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </Pressable>
  );
}

export function RestTimer({
  endsAt,
  durationMs,
  onDone,
  onAdjust,
}: {
  endsAt: number;
  /** Full rest length, so the first frame is exact without reading the clock
   *  during render — Date.now() there is impure and the React Compiler is right
   *  to reject it. The interval below owns every value after that. */
  durationMs: number;
  onDone: () => void;
  onAdjust: (deltaSeconds: number) => void;
}) {
  const [remaining, setRemaining] = useState(durationMs);

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
  // ±30s can push `remaining` past the original duration, so clamp both ends
  const progress = Math.min(100, Math.max(0, (remaining / Math.max(1, durationMs)) * 100));

  return (
    // Two groups rather than five space-between children: at a large system font
    // scale the buttons drop to their own line instead of squeezing the clock.
    <View style={styles.bar}>
      {/* drains left-to-right behind the numbers — the clock read at a glance,
          without having to parse digits between sets */}
      <View style={[styles.progress, { width: `${progress}%` }]} pointerEvents="none" />
      <View style={styles.readout}>
        <Text style={styles.label} maxFontSizeMultiplier={1.3}>
          REST
        </Text>
        <Text style={styles.time} maxFontSizeMultiplier={1.3}>
          {minutes}:{String(seconds).padStart(2, "0")}
        </Text>
      </View>
      <View style={styles.actions}>
        <BarButton label="−30s" onPress={() => onAdjust(-30)} />
        <BarButton label="+30s" onPress={() => onAdjust(30)} />
        <BarButton label="Skip" onPress={onDone} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    rowGap: spacing.xs,
    columnGap: spacing.sm,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    marginBottom: spacing.sm,
    overflow: "hidden",
  },
  progress: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.accentBright,
  },
  readout: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { color: colors.text, fontWeight: "800", letterSpacing: 2, flexShrink: 1 },
  time: { color: colors.text, fontSize: 24, fontWeight: "900", fontVariant: ["tabular-nums"] },
  barButton: { color: colors.text, fontWeight: "700", paddingVertical: spacing.xs },
});
