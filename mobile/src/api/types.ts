export interface User {
  id: number;
  email: string;
  display_name: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Exercise {
  id: number;
  name: string;
  muscle_group: string;
  equipment: string;
  rest_seconds_default: number;
  is_custom: boolean;
}

export interface RoutineExercise {
  id: number;
  exercise: Exercise;
  order: number;
  superset_group: number | null;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
}

export interface Routine {
  id: number;
  name: string;
  created_at: string;
  exercises: RoutineExercise[];
}

export interface WorkoutSet {
  id: number;
  set_number: number;
  reps: number;
  weight_kg: number;
  rpe: number | null;
  is_warmup: boolean;
  completed_at: string;
  source: "manual" | "device";
}

export interface WorkoutExercise {
  id: number;
  exercise: Exercise;
  order: number;
  superset_group: number | null;
  sets: WorkoutSet[];
}

export interface Workout {
  id: number;
  routine_id: number | null;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
  exercises: WorkoutExercise[];
}

export interface WorkoutSummary {
  id: number;
  routine_id: number | null;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
}

export interface ExerciseHistoryEntry {
  workout_id: number;
  date: string;
  sets: WorkoutSet[];
}

export interface RepPR {
  reps: number;
  weight_kg: number;
  date: string;
}

export interface ExercisePRs {
  exercise: Exercise;
  records: RepPR[];
}

export interface WeekVolume {
  week_start: string;
  total_volume_kg: number;
  by_muscle_group: Record<string, number>;
}

export interface ExerciseTrendPoint {
  workout_id: number;
  date: string;
  best_est_1rm: number;
  top_weight_kg: number;
  total_volume_kg: number;
}

export interface BodyweightEntry {
  id: number;
  date: string;
  weight_kg: number;
}

export interface ApiKeyInfo {
  id: number;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  key?: string; // only present right after creation
}

export type LiveMessage =
  | { type: "rep"; exercise_id: number; count: number }
  | { type: "set_logged"; workout_exercise_id: number; exercise_id: number; set: WorkoutSet }
  | { type: "pong" }
  | { type: "error"; detail: string };
