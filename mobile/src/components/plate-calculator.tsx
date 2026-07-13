import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Button, Card } from "@/components/ui";
import { WeightUnit } from "@/store/settings";
import { colors, spacing } from "@/theme/colors";

const BARS: Record<WeightUnit, number> = { kg: 20, lb: 45 };
const PLATES: Record<WeightUnit, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
};

function platesPerSide(total: number, unit: WeightUnit): { plate: number; count: number }[] | null {
  let perSide = (total - BARS[unit]) / 2;
  if (perSide < 0) return null;
  const result: { plate: number; count: number }[] = [];
  for (const plate of PLATES[unit]) {
    const count = Math.floor(perSide / plate + 1e-9);
    if (count > 0) {
      result.push({ plate, count });
      perSide = Math.round((perSide - count * plate) * 100) / 100;
    }
  }
  return result;
}

export function PlateCalculator({
  visible,
  weight,
  unit,
  onClose,
}: {
  visible: boolean;
  weight: number;
  unit: WeightUnit;
  onClose: () => void;
}) {
  const breakdown = platesPerSide(weight, unit);
  const loadable =
    breakdown !== null
      ? BARS[unit] + 2 * breakdown.reduce((sum, p) => sum + p.plate * p.count, 0)
      : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable>
          <Card style={styles.sheet}>
            <Text style={styles.title}>
              Plates for {weight} {unit}
            </Text>
            <Text style={styles.sub}>
              {BARS[unit]} {unit} bar · per side:
            </Text>
            {breakdown === null ? (
              <Text style={styles.warn}>Lighter than the bar — no plates needed.</Text>
            ) : breakdown.length === 0 ? (
              <Text style={styles.warn}>Empty bar.</Text>
            ) : (
              breakdown.map(({ plate, count }) => (
                <View key={plate} style={styles.row}>
                  <Text style={styles.plate}>{plate} {unit}</Text>
                  <Text style={styles.count}>× {count}</Text>
                </View>
              ))
            )}
            {loadable !== null && loadable !== weight ? (
              <Text style={styles.warn}>
                Closest loadable: {loadable} {unit}
              </Text>
            ) : null}
            <Button title="Close" variant="secondary" onPress={onClose} />
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
  sheet: { gap: spacing.xs },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.xs },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  plate: { color: colors.text, fontSize: 15, fontWeight: "700" },
  count: { color: colors.success, fontSize: 15, fontWeight: "800" },
  warn: { color: colors.textMuted, fontSize: 13, marginVertical: spacing.xs },
});
