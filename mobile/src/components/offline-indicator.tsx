import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { useConnectivity } from "@/store/connectivity";
import { colors, spacing } from "@/theme/colors";

/**
 * Header badge shown while the screens are drawing on responses saved on the
 * phone because the server is unreachable — otherwise stale numbers would look
 * exactly like live ones.
 */
export function OfflineIndicator() {
  const servingCached = useConnectivity((s) => s.servingCached);
  if (!servingCached) return null;
  return (
    <View style={styles.badge} accessibilityLabel="Offline, showing saved data">
      <Ionicons name="cloud-offline-outline" size={14} color={colors.textMuted} />
      <Text style={styles.text} maxFontSizeMultiplier={1.2}>
        Saved data
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginRight: spacing.md,
  },
  text: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
});
