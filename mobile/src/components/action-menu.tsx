import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text } from "react-native";

import { Card } from "@/components/ui";
import { colors, spacing } from "@/theme/colors";

export interface MenuAction {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
}

/**
 * A short list of full-width rows in place of a row of small icons. Each row is
 * 48dp tall — Android's minimum touch target — which a row of 18px icons with
 * hit slop never was. Centred like the plate calculator, so it needs no insets.
 */
export function ActionMenu({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title: string;
  actions: MenuAction[];
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheetWrap}>
          <Card style={styles.sheet}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            {actions.map((action) => (
              <Pressable
                key={action.label}
                onPress={() => {
                  onClose();
                  action.onPress();
                }}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
              >
                <Ionicons
                  name={action.icon}
                  size={20}
                  color={action.destructive ? colors.alert : colors.textMuted}
                />
                <Text style={[styles.label, action.destructive && { color: colors.alert }]}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.row, styles.cancel, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  sheetWrap: { width: "100%", maxWidth: 520, alignSelf: "center" },
  sheet: { paddingVertical: spacing.sm },
  title: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 48,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  label: { color: colors.text, fontSize: 16, fontWeight: "600", flexShrink: 1 },
  cancel: { justifyContent: "center" },
  cancelText: { color: colors.accentBright, fontSize: 16, fontWeight: "700" },
});
