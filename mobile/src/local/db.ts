import { Platform } from "react-native";

import type { BodyweightEntry, Exercise } from "../api/types";

/**
 * On-phone database for local mode: one JSON document in the app's document
 * directory. Entities mirror the backend models but store `exercise_id`
 * references; API shapes (with nested exercise objects) are assembled in
 * `local/api.ts`.
 */

export interface StoredSet {
  id: number;
  set_number: number;
  reps: number;
  weight_kg: number;
  rpe: number | null;
  is_warmup: boolean;
  completed_at: string;
  source: "manual" | "device";
}

export interface StoredWorkoutExercise {
  id: number;
  exercise_id: number;
  order: number;
  superset_group: number | null;
  target_reps_min: number | null;
  target_reps_max: number | null;
  sets: StoredSet[];
}

export interface StoredWorkout {
  id: number;
  routine_id: number | null;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
  exercises: StoredWorkoutExercise[];
}

export interface StoredRoutineExercise {
  id: number;
  exercise_id: number;
  order: number;
  superset_group: number | null;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
}

export interface StoredRoutine {
  id: number;
  name: string;
  created_at: string;
  exercises: StoredRoutineExercise[];
}

export interface LocalDB {
  nextId: number;
  customExercises: Exercise[];
  routines: StoredRoutine[];
  workouts: StoredWorkout[];
  bodyweight: BodyweightEntry[];
}

// Built-in catalog ids are 1..N (list position); locally created entities
// start far above so a growing catalog never collides with stored references.
const FIRST_LOCAL_ID = 1_000_000;
const FILE_NAME = "rozakos-local-db.json";
const WEB_KEY = "rozakos_local_db";

function emptyDb(): LocalDB {
  return { nextId: FIRST_LOCAL_ID, customExercises: [], routines: [], workouts: [], bodyweight: [] };
}

let cache: LocalDB | null = null;

function readRaw(): string | null {
  if (Platform.OS === "web") return globalThis.localStorage?.getItem(WEB_KEY) ?? null;
  // Required lazily so the native module never loads on web.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { File, Paths } = require("expo-file-system") as typeof import("expo-file-system");
  const file = new File(Paths.document, FILE_NAME);
  return file.exists ? file.textSync() : null;
}

function writeRaw(json: string): void {
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(WEB_KEY, json);
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { File, Paths } = require("expo-file-system") as typeof import("expo-file-system");
  const file = new File(Paths.document, FILE_NAME);
  if (!file.exists) file.create();
  file.write(json);
}

export function loadDb(): LocalDB {
  if (cache === null) {
    const raw = readRaw();
    cache = raw ? { ...emptyDb(), ...(JSON.parse(raw) as LocalDB) } : emptyDb();
  }
  return cache;
}

export function saveDb(): void {
  if (cache !== null) writeRaw(JSON.stringify(cache));
}

export function nextId(db: LocalDB): number {
  return db.nextId++;
}
