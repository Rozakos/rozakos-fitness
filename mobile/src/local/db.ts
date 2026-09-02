import { Platform } from "react-native";

import type { BodyweightEntry, Exercise, ExerciseSetupEntry } from "../api/types";

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
  /** Increments after every user-data mutation, so imports can be retried once
   * without preventing a later batch of newly-created local data. */
  revision: number;
  accountImports: Record<
    string,
    { importId: string; revision: number; completed: boolean }
  >;
  customExercises: Exercise[];
  routines: StoredRoutine[];
  workouts: StoredWorkout[];
  bodyweight: BodyweightEntry[];
  /**
   * exercise id → form-demo video URL, for built-in and custom exercises alike.
   * Kept outside `customExercises` because the built-in catalog is a constant
   * derived from `catalog.ts` and must stay immutable.
   */
  exerciseVideos: Record<number, string>;
  /** exercise id → machine-setup rows, stored alongside the videos and for the
   * same reason: the built-in catalog is a module constant and stays immutable. */
  exerciseSetups: Record<number, ExerciseSetupEntry[]>;
}

// Built-in catalog ids are 1..N (list position); locally created entities
// start far above so a growing catalog never collides with stored references.
const FIRST_LOCAL_ID = 1_000_000;
const FILE_NAME = "rozakos-local-db.json";
const WEB_KEY = "rozakos_local_db";

function emptyDb(): LocalDB {
  return {
    nextId: FIRST_LOCAL_ID,
    revision: 0,
    accountImports: {},
    customExercises: [],
    routines: [],
    workouts: [],
    bodyweight: [],
    exerciseVideos: {},
    exerciseSetups: {},
  };
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
  if (cache !== null) {
    cache.revision += 1;
    writeRaw(JSON.stringify(cache));
  }
}

export function nextId(db: LocalDB): number {
  return db.nextId++;
}

export interface LocalImportPayload {
  import_id: string;
  custom_exercises: {
    local_id: number;
    name: string;
    muscle_group: string;
    equipment: string;
    rest_seconds_default: number;
    video_url: string | null;
    setup: ExerciseSetupEntry[];
  }[];
  exercise_preferences: {
    exercise_id: number;
    video_url: string | null;
    setup: ExerciseSetupEntry[];
  }[];
  routines: {
    local_id: number;
    name: string;
    created_at: string;
    exercises: Omit<StoredRoutineExercise, "id">[];
  }[];
  workouts: {
    local_id: number;
    routine_id: number | null;
    started_at: string;
    finished_at: string | null;
    notes: string | null;
    exercises: {
      exercise_id: number;
      order: number;
      superset_group: number | null;
      target_reps_min: number | null;
      target_reps_max: number | null;
      sets: Omit<StoredSet, "id">[];
    }[];
  }[];
  bodyweight: { date: string; weight_kg: number }[];
}

function persistMetadata(db: LocalDB): void {
  writeRaw(JSON.stringify(db));
}

/** Build and persist the one-time idempotent snapshot for this account. */
export function prepareLocalImport(
  userId: number,
  accountIdentity = String(userId),
): LocalImportPayload | null {
  const db = loadDb();
  const hasData =
    db.customExercises.length > 0 ||
    db.routines.length > 0 ||
    db.workouts.length > 0 ||
    db.bodyweight.length > 0 ||
    Object.keys(db.exerciseVideos).length > 0 ||
    Object.keys(db.exerciseSetups).length > 0;
  if (!hasData) return null;

  const accountKey = accountIdentity;
  let marker = db.accountImports[accountKey];
  // A later full snapshot would duplicate entities imported by the first one.
  // Further local changes need the stable entity IDs/outbox planned for
  // bidirectional sync, not a fresh import id.
  if (marker?.completed) return null;
  if (marker === undefined) {
    marker = {
      importId: `phone-${userId}-${db.revision}-${new Date().toISOString().replace(/[^0-9]/g, "")}`,
      revision: db.revision,
      completed: false,
    };
    db.accountImports[accountKey] = marker;
    persistMetadata(db);
  }

  const customIds = new Set(db.customExercises.map((exercise) => exercise.id));
  const preferenceIds = new Set([
    ...Object.keys(db.exerciseVideos).map(Number),
    ...Object.keys(db.exerciseSetups).map(Number),
  ]);
  return {
    import_id: marker.importId,
    custom_exercises: db.customExercises.map((exercise) => ({
      local_id: exercise.id,
      name: exercise.name,
      muscle_group: exercise.muscle_group,
      equipment: exercise.equipment,
      rest_seconds_default: exercise.rest_seconds_default,
      video_url: db.exerciseVideos[exercise.id] ?? null,
      setup: (db.exerciseSetups[exercise.id] ?? []).map((row) => ({ ...row })),
    })),
    exercise_preferences: [...preferenceIds]
      .filter((exerciseId) => !customIds.has(exerciseId))
      .map((exerciseId) => ({
        exercise_id: exerciseId,
        video_url: db.exerciseVideos[exerciseId] ?? null,
        setup: (db.exerciseSetups[exerciseId] ?? []).map((row) => ({ ...row })),
      })),
    routines: db.routines.map((routine) => ({
      local_id: routine.id,
      name: routine.name,
      created_at: routine.created_at,
      exercises: routine.exercises.map(({ id: _id, ...exercise }) => ({ ...exercise })),
    })),
    workouts: db.workouts.map((workout) => ({
      local_id: workout.id,
      routine_id: workout.routine_id,
      started_at: workout.started_at,
      finished_at: workout.finished_at,
      notes: workout.notes,
      exercises: workout.exercises.map((exercise) => ({
        exercise_id: exercise.exercise_id,
        order: exercise.order,
        superset_group: exercise.superset_group,
        target_reps_min: exercise.target_reps_min,
        target_reps_max: exercise.target_reps_max,
        sets: exercise.sets.map(({ id: _id, ...workoutSet }) => ({ ...workoutSet })),
      })),
    })),
    bodyweight: db.bodyweight.map(({ date, weight_kg }) => ({ date, weight_kg })),
  };
}

export function completeLocalImport(
  userId: number,
  importId: string,
  accountIdentity = String(userId),
): void {
  const db = loadDb();
  const marker = db.accountImports[accountIdentity];
  if (marker?.importId !== importId) return;
  marker.completed = true;
  persistMetadata(db);
}
