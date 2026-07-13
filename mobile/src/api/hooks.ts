import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type {
  ApiKeyInfo,
  BodyweightEntry,
  Exercise,
  ExerciseHistoryEntry,
  ExercisePRs,
  ExerciseTrendPoint,
  Routine,
  WeekVolume,
  Workout,
  WorkoutSet,
  WorkoutSummary,
} from "./types";

// --- exercises ---

export function useExercises(search?: string, muscleGroup?: string) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (muscleGroup) params.set("muscle_group", muscleGroup);
  const qs = params.toString();
  return useQuery<Exercise[]>({
    queryKey: ["exercises", search ?? "", muscleGroup ?? ""],
    queryFn: () => api(`/exercises${qs ? `?${qs}` : ""}`),
  });
}

export function useExerciseHistory(exerciseId: number | undefined, limit = 5) {
  return useQuery<ExerciseHistoryEntry[]>({
    queryKey: ["exercise-history", exerciseId, limit],
    queryFn: () => api(`/exercises/${exerciseId}/history?limit=${limit}`),
    enabled: exerciseId !== undefined,
  });
}

export function useCreateExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; muscle_group: string; equipment: string }) =>
      api<Exercise>("/exercises", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exercises"] }),
  });
}

// --- routines ---

export interface RoutineExerciseInput {
  exercise_id: number;
  order: number;
  superset_group: number | null;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
}

export function useRoutines() {
  return useQuery<Routine[]>({ queryKey: ["routines"], queryFn: () => api("/routines") });
}

export function useSaveRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      name,
      exercises,
    }: {
      id?: number;
      name: string;
      exercises: RoutineExerciseInput[];
    }) =>
      id !== undefined
        ? api<Routine>(`/routines/${id}`, { method: "PUT", body: { name, exercises } })
        : api<Routine>("/routines", { method: "POST", body: { name, exercises } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["routines"] }),
  });
}

export function useDeleteRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/routines/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["routines"] }),
  });
}

// --- workouts ---

export function useActiveWorkout() {
  return useQuery<Workout | null>({
    queryKey: ["active-workout"],
    queryFn: () => api("/workouts/active"),
  });
}

export function useWorkoutHistory(limit = 20) {
  return useQuery<WorkoutSummary[]>({
    queryKey: ["workouts", limit],
    queryFn: () => api(`/workouts?limit=${limit}`),
  });
}

export function useWorkout(id: number | undefined) {
  return useQuery<Workout>({
    queryKey: ["workout", id],
    queryFn: () => api(`/workouts/${id}`),
    enabled: id !== undefined,
  });
}

function useWorkoutMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["active-workout"] });
      qc.invalidateQueries({ queryKey: ["workouts"] });
    },
  });
}

export function useStartWorkout() {
  return useWorkoutMutation((body: { routine_id?: number }) =>
    api<Workout>("/workouts", { method: "POST", body }),
  );
}

export function useFinishWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<Workout>(`/workouts/${id}/finish`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
}

export function useDeleteWorkout() {
  return useWorkoutMutation((id: number) => api(`/workouts/${id}`, { method: "DELETE" }));
}

export function useAddWorkoutExercise() {
  return useWorkoutMutation(
    ({ workoutId, exerciseId, supersetGroup }: {
      workoutId: number;
      exerciseId: number;
      supersetGroup?: number | null;
    }) =>
      api(`/workouts/${workoutId}/exercises`, {
        method: "POST",
        body: { exercise_id: exerciseId, superset_group: supersetGroup ?? null },
      }),
  );
}

export function useUpdateWorkoutExercise() {
  return useWorkoutMutation(
    ({ workoutId, weId, ...body }: {
      workoutId: number;
      weId: number;
      exercise_id?: number;
      order?: number;
      superset_group?: number | null;
    }) => api(`/workouts/${workoutId}/exercises/${weId}`, { method: "PATCH", body }),
  );
}

export function useRemoveWorkoutExercise() {
  return useWorkoutMutation(({ workoutId, weId }: { workoutId: number; weId: number }) =>
    api(`/workouts/${workoutId}/exercises/${weId}`, { method: "DELETE" }),
  );
}

export function useLogSet() {
  return useWorkoutMutation(
    ({ workoutId, weId, ...body }: {
      workoutId: number;
      weId: number;
      reps: number;
      weight_kg: number;
      rpe?: number | null;
      is_warmup?: boolean;
    }) => api<WorkoutSet>(`/workouts/${workoutId}/exercises/${weId}/sets`, { method: "POST", body }),
  );
}

export function useUpdateSet() {
  return useWorkoutMutation(
    ({ workoutId, weId, setId, ...body }: {
      workoutId: number;
      weId: number;
      setId: number;
      reps?: number;
      weight_kg?: number;
      rpe?: number | null;
      is_warmup?: boolean;
    }) =>
      api<WorkoutSet>(`/workouts/${workoutId}/exercises/${weId}/sets/${setId}`, {
        method: "PATCH",
        body,
      }),
  );
}

export function useDeleteSet() {
  return useWorkoutMutation(
    ({ workoutId, weId, setId }: { workoutId: number; weId: number; setId: number }) =>
      api(`/workouts/${workoutId}/exercises/${weId}/sets/${setId}`, { method: "DELETE" }),
  );
}

// --- stats & bodyweight ---

export function usePRs() {
  return useQuery<ExercisePRs[]>({ queryKey: ["prs"], queryFn: () => api("/stats/prs") });
}

export function useWeeklyVolume(weeks = 12) {
  return useQuery<WeekVolume[]>({
    queryKey: ["volume", weeks],
    queryFn: () => api(`/stats/volume?weeks=${weeks}`),
  });
}

export function useExerciseTrend(exerciseId: number | undefined) {
  return useQuery<ExerciseTrendPoint[]>({
    queryKey: ["trend", exerciseId],
    queryFn: () => api(`/stats/exercise/${exerciseId}`),
    enabled: exerciseId !== undefined,
  });
}

export function useBodyweight() {
  return useQuery<BodyweightEntry[]>({
    queryKey: ["bodyweight"],
    queryFn: () => api("/bodyweight"),
  });
}

export function useLogBodyweight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { date: string; weight_kg: number }) =>
      api<BodyweightEntry>("/bodyweight", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bodyweight"] }),
  });
}

// --- devices ---

export function useDevices() {
  return useQuery<ApiKeyInfo[]>({ queryKey: ["devices"], queryFn: () => api("/devices") });
}

export function useCreateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api<ApiKeyInfo>("/devices", { method: "POST", body: { name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });
}

export function useRevokeDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/devices/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });
}
