import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Workout } from "@/api/types";
import { fromKg, useSettings } from "@/store/settings";
import { colors, spacing } from "@/theme/colors";

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/**
 * Running session clock. The clock is only ever read inside timer callbacks:
 * Date.now() during render is impure and the React Compiler rejects it, so the
 * first frame shows a placeholder and the zero-delay timeout fills it at once.
 */
function SessionClock({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, []);
  return (
    <Text style={styles.clock} maxFontSizeMultiplier={1.3}>
      {now === null ? "–:––" : formatElapsed(now - new Date(startedAt).getTime())}
    </Text>
  );
}

/** Pinned above the scrolling exercise list, so time, totals and the rest timer
 *  stay in view however far down the session the user has scrolled. */
export function SessionBar({
  workout,
  deviceConnected,
  children,
}: {
  workout: Workout;
  /** Whether a rep-counting device is on the live channel (account mode only). */
  deviceConnected: boolean;
  /** The rest timer, when one is running. */
  children?: React.ReactNode;
}) {
  const unit = useSettings((s) => s.unit);
  const working = workout.exercises.flatMap((we) => we.sets.filter((s) => !s.is_warmup));
  const volume = working.reduce((sum, s) => sum + s.reps * s.weight_kg, 0);

  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <SessionClock startedAt={workout.started_at} />
        <Text style={styles.stats} maxFontSizeMultiplier={1.3}>
          {working.length} set{working.length === 1 ? "" : "s"} ·{" "}
          {Math.round(fromKg(volume, unit)).toLocaleString()} {unit}
        </Text>
        {deviceConnected ? (
          <Text style={styles.device} maxFontSizeMultiplier={1.3}>
            ● device live
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    columnGap: spacing.md,
    rowGap: spacing.xs,
    marginBottom: spacing.sm,
  },
  clock: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  stats: { color: colors.textMuted, fontSize: 13, fontWeight: "600", flexShrink: 1 },
  device: { color: colors.success, fontSize: 12, fontWeight: "700", marginLeft: "auto" },
});
