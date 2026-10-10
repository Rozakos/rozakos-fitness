import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Feedback for a phone lying on a bench: a short tap when a set is saved, a
 * distinct pattern when rest is over. Never allowed to throw — a device with
 * haptics disabled or missing must behave exactly as before.
 */
export function buzz(kind: "set-logged" | "rest-over"): void {
  if (Platform.OS === "web") return;
  const run =
    kind === "set-logged"
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  run.catch(() => {});
}
