import { ApiError } from "../api/error";
import type {
  Exercise,
  ExerciseHistoryEntry,
  ExercisePRs,
  ExerciseTrendPoint,
  RepPR,
  Routine,
  WeekVolume,
  Workout,
  WorkoutExercise,
  WorkoutSummary,
} from "../api/types";
import { BUILTIN_EXERCISES } from "./catalog";
import {
  LocalDB,
  StoredRoutine,
  StoredSet,
  StoredWorkout,
  StoredWorkoutExercise,
  loadDb,
  nextId,
  saveDb,
} from "./db";

/**
 * Local-mode implementation of the REST API consumed by `src/api/hooks.ts`.
 * Mirrors the FastAPI routers' behavior (see backend/app/routers/) against the
 * on-phone JSON database, so every hook works unchanged without an account.
 */

const MAX_PR_REPS = 12;

const builtinExercises: Exercise[] = BUILTIN_EXERCISES.map(([name, muscle_group, equipment, rest], i) => ({
  id: i + 1,
  name,
  muscle_group,
  equipment,
  rest_seconds_default: rest,
  is_custom: false,
}));

function allExercises(db: LocalDB): Exercise[] {
  return [...builtinExercises, ...db.customExercises];
}

function getExercise(db: LocalDB, id: number): Exercise {
  const found = allExercises(db).find((e) => e.id === id);
  if (!found) throw new ApiError(404, "Exercise not found");
  return found;
}

function notFound(what: string): never {
  throw new ApiError(404, `${what} not found`);
}

function now(): string {
  return new Date().toISOString();
}

// --- serialization to API shapes ---

function serializeRoutine(db: LocalDB, r: StoredRoutine): Routine {
  return {
    id: r.id,
    name: r.name,
    created_at: r.created_at,
    exercises: r.exercises.map((re) => ({
      id: re.id,
      exercise: getExercise(db, re.exercise_id),
      order: re.order,
      superset_group: re.superset_group,
      target_sets: re.target_sets,
      target_reps_min: re.target_reps_min,
      target_reps_max: re.target_reps_max,
    })),
  };
}

/**
 * Sets must be copied out of the store, never aliased. React Query's structural
 * sharing short-circuits on `prev === next`, so handing back the same array we
 * later `push` into makes an added set invisible: the query data keeps its old
 * identity and no component re-renders (the set only surfaces on a screen that
 * queries fresh, e.g. the post-workout summary).
 */
function copySets(sets: StoredSet[]): StoredSet[] {
  return sets.map((s) => ({ ...s }));
}

function serializeWorkoutExercise(db: LocalDB, we: StoredWorkoutExercise): WorkoutExercise {
  return {
    id: we.id,
    exercise: getExercise(db, we.exercise_id),
    order: we.order,
    superset_group: we.superset_group,
    target_reps_min: we.target_reps_min,
    target_reps_max: we.target_reps_max,
    sets: copySets(we.sets),
  };
}

function serializeWorkout(db: LocalDB, w: StoredWorkout): Workout {
  return {
    id: w.id,
    routine_id: w.routine_id,
    started_at: w.started_at,
    finished_at: w.finished_at,
    notes: w.notes,
    exercises: w.exercises.map((we) => serializeWorkoutExercise(db, we)),
  };
}

function summarize(w: StoredWorkout): WorkoutSummary {
  return {
    id: w.id,
    routine_id: w.routine_id,
    started_at: w.started_at,
    finished_at: w.finished_at,
    notes: w.notes,
  };
}

// --- lookups ---

function getWorkout(db: LocalDB, id: number): StoredWorkout {
  return db.workouts.find((w) => w.id === id) ?? notFound("Workout");
}

function getWorkoutExercise(w: StoredWorkout, weId: number): StoredWorkoutExercise {
  return w.exercises.find((we) => we.id === weId) ?? notFound("Workout exercise");
}

function activeWorkout(db: LocalDB): StoredWorkout | null {
  const open = db.workouts.filter((w) => w.finished_at === null);
  open.sort((a, b) => b.started_at.localeCompare(a.started_at));
  return open[0] ?? null;
}

interface WorkingSetRow {
  set: StoredSet;
  we: StoredWorkoutExercise;
  workout: StoredWorkout;
}

/** Finished workouts only, warm-ups and zero-rep sets excluded — matches stats.py. */
function workingSets(db: LocalDB): WorkingSetRow[] {
  const rows: WorkingSetRow[] = [];
  for (const workout of db.workouts) {
    if (workout.finished_at === null) continue;
    for (const we of workout.exercises) {
      for (const set of we.sets) {
        if (!set.is_warmup && set.reps > 0) rows.push({ set, we, workout });
      }
    }
  }
  return rows;
}

function epley1rm(weightKg: number, reps: number): number {
  return reps <= 1 ? weightKg : weightKg * (1 + reps / 30);
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/** Monday of the week containing the given date, as YYYY-MM-DD. */
function weekStart(iso: string): string {
  const d = new Date(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// --- route handlers ---

function listExercises(db: LocalDB, params: URLSearchParams): Exercise[] {
  const search = params.get("search")?.toLowerCase();
  const muscle = params.get("muscle_group");
  let list = allExercises(db);
  if (search) list = list.filter((e) => e.name.toLowerCase().includes(search));
  if (muscle) list = list.filter((e) => e.muscle_group === muscle);
  return list.sort(
    (a, b) => a.muscle_group.localeCompare(b.muscle_group) || a.name.localeCompare(b.name),
  );
}

function exerciseHistory(db: LocalDB, exerciseId: number, limit: number): ExerciseHistoryEntry[] {
  getExercise(db, exerciseId);
  const entries: ExerciseHistoryEntry[] = [];
  const finished = db.workouts
    .filter((w) => w.finished_at !== null)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  for (const workout of finished) {
    for (const we of workout.exercises) {
      if (we.exercise_id !== exerciseId || we.sets.length === 0) continue;
      entries.push({ workout_id: workout.id, date: workout.started_at, sets: copySets(we.sets) });
    }
    if (entries.length >= limit) break;
  }
  return entries.slice(0, limit);
}

function personalRecords(db: LocalDB): ExercisePRs[] {
  const best = new Map<number, Map<number, { weight: number; date: string }>>();
  for (const { set, we } of workingSets(db)) {
    const reps = Math.min(set.reps, MAX_PR_REPS);
    let perExercise = best.get(we.exercise_id);
    if (!perExercise) best.set(we.exercise_id, (perExercise = new Map()));
    const current = perExercise.get(reps);
    if (!current || set.weight_kg > current.weight) {
      perExercise.set(reps, { weight: set.weight_kg, date: set.completed_at });
    }
  }
  const result: ExercisePRs[] = [];
  for (const [exerciseId, records] of best) {
    const recs: RepPR[] = [...records.entries()]
      .sort(([a], [b]) => a - b)
      .map(([reps, { weight, date }]) => ({ reps, weight_kg: weight, date }));
    result.push({ exercise: getExercise(db, exerciseId), records: recs });
  }
  return result.sort((a, b) => a.exercise.name.localeCompare(b.exercise.name));
}

function weeklyVolume(db: LocalDB, weeks: number): WeekVolume[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeks * 7);
  const buckets = new Map<string, { total: number; byMuscle: Map<string, number> }>();
  for (const { set, we, workout } of workingSets(db)) {
    if (new Date(workout.started_at) < cutoff) continue;
    const week = weekStart(workout.started_at);
    let entry = buckets.get(week);
    if (!entry) buckets.set(week, (entry = { total: 0, byMuscle: new Map() }));
    const volume = set.reps * set.weight_kg;
    const muscle = getExercise(db, we.exercise_id).muscle_group;
    entry.total += volume;
    entry.byMuscle.set(muscle, (entry.byMuscle.get(muscle) ?? 0) + volume);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week_start, data]) => ({
      week_start,
      total_volume_kg: round1(data.total),
      by_muscle_group: Object.fromEntries(
        [...data.byMuscle.entries()].map(([k, v]) => [k, round1(v)]),
      ),
    }));
}

function exerciseTrend(db: LocalDB, exerciseId: number): ExerciseTrendPoint[] {
  getExercise(db, exerciseId);
  const byWorkout = new Map<
    number,
    { date: string; best1rm: number; topWeight: number; volume: number }
  >();
  const rows = workingSets(db)
    .filter((r) => r.we.exercise_id === exerciseId)
    .sort((a, b) => a.workout.started_at.localeCompare(b.workout.started_at));
  for (const { set, workout } of rows) {
    let entry = byWorkout.get(workout.id);
    if (!entry) {
      byWorkout.set(
        workout.id,
        (entry = { date: workout.started_at, best1rm: 0, topWeight: 0, volume: 0 }),
      );
    }
    entry.best1rm = Math.max(entry.best1rm, epley1rm(set.weight_kg, set.reps));
    entry.topWeight = Math.max(entry.topWeight, set.weight_kg);
    entry.volume += set.reps * set.weight_kg;
  }
  return [...byWorkout.entries()].map(([workout_id, data]) => ({
    workout_id,
    date: data.date,
    best_est_1rm: round1(data.best1rm),
    top_weight_kg: data.topWeight,
    total_volume_kg: round1(data.volume),
  }));
}

interface RoutineExerciseBody {
  exercise_id: number;
  order?: number;
  superset_group?: number | null;
  target_sets?: number;
  target_reps_min?: number;
  target_reps_max?: number;
}

function buildRoutineExercises(db: LocalDB, exercises: RoutineExerciseBody[]) {
  return exercises.map((ex, i) => {
    getExercise(db, ex.exercise_id);
    return {
      id: nextId(db),
      exercise_id: ex.exercise_id,
      order: ex.order ? ex.order : i,
      superset_group: ex.superset_group ?? null,
      target_sets: ex.target_sets ?? 3,
      target_reps_min: ex.target_reps_min ?? 8,
      target_reps_max: ex.target_reps_max ?? 12,
    };
  });
}

// --- router ---

export async function localApi<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const db = loadDb();
  const method = options.method ?? "GET";
  // request bodies are free-form JSON, shaped per route below
  const body = (options.body ?? {}) as any;
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  const seg = pathname.split("/").filter(Boolean);

  const result = ((): unknown => {
    // /exercises...
    if (seg[0] === "exercises") {
      if (seg.length === 1 && method === "GET") return listExercises(db, params);
      if (seg.length === 1 && method === "POST") {
        const exercise: Exercise = {
          id: nextId(db),
          name: body.name,
          muscle_group: body.muscle_group,
          equipment: body.equipment ?? "barbell",
          rest_seconds_default: body.rest_seconds_default ?? 120,
          is_custom: true,
        };
        db.customExercises.push(exercise);
        saveDb();
        return exercise;
      }
      const exerciseId = Number(seg[1]);
      if (seg.length === 2 && method === "GET") return getExercise(db, exerciseId);
      if (seg[2] === "history" && method === "GET") {
        return exerciseHistory(db, exerciseId, Number(params.get("limit") ?? 10));
      }
    }

    // /routines...
    if (seg[0] === "routines") {
      if (seg.length === 1 && method === "GET") {
        return db.routines
          .slice()
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((r) => serializeRoutine(db, r));
      }
      if (seg.length === 1 && method === "POST") {
        const routine: StoredRoutine = {
          id: nextId(db),
          name: body.name,
          created_at: now(),
          exercises: buildRoutineExercises(db, body.exercises ?? []),
        };
        db.routines.push(routine);
        saveDb();
        return serializeRoutine(db, routine);
      }
      const routine = db.routines.find((r) => r.id === Number(seg[1])) ?? notFound("Routine");
      if (method === "GET") return serializeRoutine(db, routine);
      if (method === "PUT") {
        routine.name = body.name;
        routine.exercises = buildRoutineExercises(db, body.exercises ?? []);
        saveDb();
        return serializeRoutine(db, routine);
      }
      if (method === "DELETE") {
        db.routines = db.routines.filter((r) => r.id !== routine.id);
        saveDb();
        return undefined;
      }
    }

    // /workouts...
    if (seg[0] === "workouts") {
      if (seg.length === 1 && method === "GET") {
        const limit = Number(params.get("limit") ?? 20);
        const offset = Number(params.get("offset") ?? 0);
        return db.workouts
          .filter((w) => w.finished_at !== null)
          .sort((a, b) => b.started_at.localeCompare(a.started_at))
          .slice(offset, offset + limit)
          .map(summarize);
      }
      if (seg.length === 1 && method === "POST") {
        if (activeWorkout(db) !== null) {
          throw new ApiError(409, "A workout is already in progress");
        }
        const workout: StoredWorkout = {
          id: nextId(db),
          routine_id: body.routine_id ?? null,
          started_at: now(),
          finished_at: null,
          notes: body.notes ?? null,
          exercises: [],
        };
        if (workout.routine_id !== null) {
          const routine =
            db.routines.find((r) => r.id === workout.routine_id) ?? notFound("Routine");
          workout.exercises = routine.exercises.map((re) => ({
            id: nextId(db),
            exercise_id: re.exercise_id,
            order: re.order,
            superset_group: re.superset_group,
            target_reps_min: re.target_reps_min,
            target_reps_max: re.target_reps_max,
            sets: [],
          }));
        }
        db.workouts.push(workout);
        saveDb();
        return serializeWorkout(db, workout);
      }
      if (seg[1] === "active" && method === "GET") {
        const active = activeWorkout(db);
        return active ? serializeWorkout(db, active) : null;
      }
      const workout = getWorkout(db, Number(seg[1]));

      if (seg.length === 2) {
        if (method === "GET") return serializeWorkout(db, workout);
        if (method === "PATCH") {
          if ("notes" in body) workout.notes = body.notes;
          saveDb();
          return serializeWorkout(db, workout);
        }
        if (method === "DELETE") {
          db.workouts = db.workouts.filter((w) => w.id !== workout.id);
          saveDb();
          return undefined;
        }
      }
      if (seg[2] === "finish" && method === "POST") {
        if (workout.finished_at !== null) throw new ApiError(409, "Workout already finished");
        workout.exercises = workout.exercises.filter((we) => we.sets.length > 0);
        workout.finished_at = now();
        saveDb();
        return serializeWorkout(db, workout);
      }
      if (seg[2] === "exercises") {
        if (seg.length === 3 && method === "POST") {
          getExercise(db, body.exercise_id);
          const we: StoredWorkoutExercise = {
            id: nextId(db),
            exercise_id: body.exercise_id,
            order: Math.max(-1, ...workout.exercises.map((e) => e.order)) + 1,
            superset_group: body.superset_group ?? null,
            target_reps_min: null,
            target_reps_max: null,
            sets: [],
          };
          workout.exercises.push(we);
          saveDb();
          return serializeWorkoutExercise(db, we);
        }
        const we = getWorkoutExercise(workout, Number(seg[3]));
        if (seg.length === 4) {
          if (method === "PATCH") {
            if (body.exercise_id !== undefined && body.exercise_id !== null) {
              getExercise(db, body.exercise_id);
              we.exercise_id = body.exercise_id;
            }
            if (body.order !== undefined && body.order !== null) we.order = body.order;
            if ("superset_group" in body) we.superset_group = body.superset_group;
            saveDb();
            return serializeWorkoutExercise(db, we);
          }
          if (method === "DELETE") {
            workout.exercises = workout.exercises.filter((e) => e.id !== we.id);
            saveDb();
            return undefined;
          }
        }
        if (seg[4] === "sets") {
          if (seg.length === 5 && method === "POST") {
            const set: StoredSet = {
              id: nextId(db),
              set_number:
                Math.max(0, ...we.sets.map((s) => s.set_number).filter(Number.isFinite)) + 1,
              reps: body.reps,
              weight_kg: body.weight_kg ?? 0,
              rpe: body.rpe ?? null,
              is_warmup: body.is_warmup ?? false,
              completed_at: now(),
              source: "manual",
            };
            we.sets.push(set);
            saveDb();
            return { ...set };
          }
          const set = we.sets.find((s) => s.id === Number(seg[5])) ?? notFound("Set");
          if (method === "PATCH") {
            if ("reps" in body) set.reps = body.reps;
            if ("weight_kg" in body) set.weight_kg = body.weight_kg;
            if ("rpe" in body) set.rpe = body.rpe;
            if ("is_warmup" in body) set.is_warmup = body.is_warmup;
            saveDb();
            return { ...set };
          }
          if (method === "DELETE") {
            we.sets = we.sets.filter((s) => s.id !== set.id);
            saveDb();
            return undefined;
          }
        }
      }
    }

    // /stats...
    if (seg[0] === "stats") {
      if (seg[1] === "prs") return personalRecords(db);
      if (seg[1] === "volume") return weeklyVolume(db, Number(params.get("weeks") ?? 12));
      if (seg[1] === "exercise") return exerciseTrend(db, Number(seg[2]));
    }

    // /bodyweight...
    if (seg[0] === "bodyweight") {
      if (seg.length === 1 && method === "GET") {
        const limit = Number(params.get("limit") ?? 90);
        return db.bodyweight
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, limit);
      }
      if (seg.length === 1 && method === "POST") {
        let entry = db.bodyweight.find((e) => e.date === body.date);
        if (entry) {
          entry.weight_kg = body.weight_kg; // one entry per day, latest wins
        } else {
          entry = { id: nextId(db), date: body.date, weight_kg: body.weight_kg };
          db.bodyweight.push(entry);
        }
        saveDb();
        return entry;
      }
      if (seg.length === 2 && method === "DELETE") {
        const entry = db.bodyweight.find((e) => e.id === Number(seg[1])) ?? notFound("Entry");
        db.bodyweight = db.bodyweight.filter((e) => e.id !== entry.id);
        saveDb();
        return undefined;
      }
    }

    // /devices — requires a backend account; the UI hides this in local mode.
    if (seg[0] === "devices") {
      if (method === "GET") return [];
      throw new ApiError(400, "Devices need an account — local mode is on-phone only.");
    }

    throw new ApiError(404, `Local mode: unknown route ${method} ${pathname}`);
  })();

  return result as T;
}
