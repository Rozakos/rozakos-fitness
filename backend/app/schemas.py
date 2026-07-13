from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Auth ---

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    display_name: str = Field(min_length=1, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(ORMModel):
    id: int
    email: EmailStr
    display_name: str
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# --- Exercises ---

class ExerciseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    muscle_group: str
    equipment: str = "barbell"
    rest_seconds_default: int = 120


class ExerciseOut(ORMModel):
    id: int
    name: str
    muscle_group: str
    equipment: str
    rest_seconds_default: int
    is_custom: bool


# --- Routines ---

class RoutineExerciseIn(BaseModel):
    exercise_id: int
    order: int = 0
    superset_group: int | None = None
    target_sets: int = 3
    target_reps_min: int = 8
    target_reps_max: int = 12


class RoutineIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    exercises: list[RoutineExerciseIn] = []


class RoutineExerciseOut(ORMModel):
    id: int
    exercise: ExerciseOut
    order: int
    superset_group: int | None
    target_sets: int
    target_reps_min: int
    target_reps_max: int


class RoutineOut(ORMModel):
    id: int
    name: str
    created_at: datetime
    exercises: list[RoutineExerciseOut]


# --- Workouts ---

class WorkoutStart(BaseModel):
    routine_id: int | None = None
    notes: str | None = None


class WorkoutUpdate(BaseModel):
    notes: str | None = None


class SetIn(BaseModel):
    reps: int = Field(ge=0)
    weight_kg: float = Field(default=0.0, ge=0)
    rpe: float | None = Field(default=None, ge=1, le=10)
    is_warmup: bool = False


class SetUpdate(BaseModel):
    reps: int | None = Field(default=None, ge=0)
    weight_kg: float | None = Field(default=None, ge=0)
    rpe: float | None = Field(default=None, ge=1, le=10)
    is_warmup: bool | None = None


class SetOut(ORMModel):
    id: int
    set_number: int
    reps: int
    weight_kg: float
    rpe: float | None
    is_warmup: bool
    completed_at: datetime
    source: str


class WorkoutExerciseAdd(BaseModel):
    exercise_id: int
    superset_group: int | None = None


class WorkoutExerciseUpdate(BaseModel):
    exercise_id: int | None = None  # swap movement
    order: int | None = None
    superset_group: int | None = None


class WorkoutExerciseOut(ORMModel):
    id: int
    exercise: ExerciseOut
    order: int
    superset_group: int | None
    target_reps_min: int | None
    target_reps_max: int | None
    sets: list[SetOut]


class WorkoutOut(ORMModel):
    id: int
    routine_id: int | None
    started_at: datetime
    finished_at: datetime | None
    notes: str | None
    exercises: list[WorkoutExerciseOut]


class WorkoutSummary(ORMModel):
    id: int
    routine_id: int | None
    started_at: datetime
    finished_at: datetime | None
    notes: str | None


# --- Device ---

class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class ApiKeyOut(ORMModel):
    id: int
    name: str
    prefix: str
    created_at: datetime
    last_used_at: datetime | None


class ApiKeyCreated(ApiKeyOut):
    key: str  # plaintext, returned exactly once


class DeviceSetIn(SetIn):
    exercise_id: int


# --- Stats ---

class RepPR(BaseModel):
    reps: int
    weight_kg: float
    date: datetime


class ExercisePRs(BaseModel):
    exercise: ExerciseOut
    records: list[RepPR]


class WeekVolume(BaseModel):
    week_start: date
    total_volume_kg: float
    by_muscle_group: dict[str, float]


class ExerciseTrendPoint(BaseModel):
    workout_id: int
    date: datetime
    best_est_1rm: float
    top_weight_kg: float
    total_volume_kg: float


class ExerciseHistoryEntry(BaseModel):
    workout_id: int
    date: datetime
    sets: list[SetOut]


# --- Bodyweight ---

class BodyweightIn(BaseModel):
    date: date
    weight_kg: float = Field(gt=0)


class BodyweightOut(ORMModel):
    id: int
    date: date
    weight_kg: float
