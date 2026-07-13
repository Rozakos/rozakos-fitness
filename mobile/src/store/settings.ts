import { create } from "zustand";

import { storage } from "./storage";

export type WeightUnit = "kg" | "lb";

const UNIT_KEY = "rozakos_unit";
const KG_PER_LB = 0.45359237;

interface SettingsState {
  unit: WeightUnit;
  hydrate: () => Promise<void>;
  setUnit: (unit: WeightUnit) => Promise<void>;
}

export const useSettings = create<SettingsState>((set) => ({
  unit: "kg",
  hydrate: async () => {
    const stored = await storage.get(UNIT_KEY);
    if (stored === "kg" || stored === "lb") set({ unit: stored });
  },
  setUnit: async (unit) => {
    set({ unit });
    await storage.set(UNIT_KEY, unit);
  },
}));

/** Server stores kg; these convert at the display/input boundary. */
export function fromKg(kg: number, unit: WeightUnit): number {
  const value = unit === "lb" ? kg / KG_PER_LB : kg;
  return Math.round(value * 10) / 10;
}

export function toKg(value: number, unit: WeightUnit): number {
  const kg = unit === "lb" ? value * KG_PER_LB : value;
  return Math.round(kg * 100) / 100;
}

export function formatWeight(kg: number, unit: WeightUnit): string {
  return `${fromKg(kg, unit)} ${unit}`;
}
