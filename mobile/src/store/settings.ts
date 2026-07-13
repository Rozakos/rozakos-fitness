import { create } from "zustand";

import { storage } from "./storage";

export type WeightUnit = "kg" | "lb";
export type IntensityMode = "rpe" | "rir";

const UNIT_KEY = "rozakos_unit";
const INTENSITY_KEY = "rozakos_intensity";
const KG_PER_LB = 0.45359237;

interface SettingsState {
  unit: WeightUnit;
  intensityMode: IntensityMode;
  hydrate: () => Promise<void>;
  setUnit: (unit: WeightUnit) => Promise<void>;
  setIntensityMode: (mode: IntensityMode) => Promise<void>;
}

export const useSettings = create<SettingsState>((set) => ({
  unit: "kg",
  intensityMode: "rpe",
  hydrate: async () => {
    const [unit, intensity] = await Promise.all([
      storage.get(UNIT_KEY),
      storage.get(INTENSITY_KEY),
    ]);
    if (unit === "kg" || unit === "lb") set({ unit });
    if (intensity === "rpe" || intensity === "rir") set({ intensityMode: intensity });
  },
  setUnit: async (unit) => {
    set({ unit });
    await storage.set(UNIT_KEY, unit);
  },
  setIntensityMode: async (mode) => {
    set({ intensityMode: mode });
    await storage.set(INTENSITY_KEY, mode);
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

/** Server always stores RPE (1–10). RIR is the mirror image: RIR = 10 − RPE. */
export function rpeToDisplay(rpe: number, mode: IntensityMode): string {
  return mode === "rir" ? `RIR ${Math.round((10 - rpe) * 10) / 10}` : `RPE ${rpe}`;
}

export function displayToRpe(value: number, mode: IntensityMode): number | null {
  const rpe = mode === "rir" ? 10 - value : value;
  return rpe >= 1 && rpe <= 10 ? Math.round(rpe * 10) / 10 : null;
}
