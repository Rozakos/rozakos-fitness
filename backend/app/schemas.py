from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


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


class EmailRequest(BaseModel):
    email: EmailStr


class PasswordResetRequest(BaseModel):
    token: str
    password: str = Field(min_length=8)


class MessageResponse(BaseModel):
    detail: str


class UserOut(ORMModel):
    id: int
    email: EmailStr
    display_name: str
    created_at: datetime
    email_verified: bool


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class RegistrationResponse(BaseModel):
    access_token: str | None = None
    token_type: str = "bearer"
    user: UserOut
    email_verification_required: bool


# --- Exercises ---

def _clean_video_url(value: str | None) -> str | None:
    """Blank clears the link; anything kept must be an http(s) URL the phone can
    hand to the OS (a bare "youtube.com/..." would fail to open)."""
    if value is None:
        return None
    url = value.strip()
    if not url:
        return None
    if not url.lower().startswith(("http://", "https://")):
        raise ValueError("video_url must start with http:// or https://")
    if len(url) > 500:
        raise ValueError("video_url is too long")
    return url


MAX_SETUP_ENTRIES = 12


class SetupEntry(BaseModel):
    """One machine adjustment: the knob/pin name and whatever the machine reads.

    `value` is a string, not a number, because gyms label these inconsistently —
    a seat is "4" but a handle is "wide" and a pin is "3rd hole".
    """

    label: str = Field(min_length=1, max_length=40)
    value: str = Field(min_length=1, max_length=40)

    @field_validator("label", "value", mode="before")
    @classmethod
    def _strip(cls, value: object) -> object:
        # before the length constraints, so "  " is rejected rather than stored blank
        return value.strip() if isinstance(value, str) else value


def _clean_setup(value: list[SetupEntry] | None) -> list[SetupEntry]:
    """`null` and `[]` both mean "nothing recorded". The cap keeps a shared
    built-in exercise row from growing an unbounded blob."""
    if value is None:
        return []
    if len(value) > MAX_SETUP_ENTRIES:
        raise ValueError(f"at most {MAX_SETUP_ENTRIES} setup rows")
    return value


class ExerciseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    muscle_group: str
    equipment: str = "barbell"
    rest_seconds_default: int = 120
    video_url: str | None = None
    setup: list[SetupEntry] | None = None

    _normalize_video_url = field_validator("video_url")(_clean_video_url)
    _normalize_setup = field_validator("setup")(_clean_setup)


class ExerciseUpdate(BaseModel):
    """Only the fields the app can edit on an existing exercise."""

    video_url: str | None = None
    setup: list[SetupEntry] | None = None

    _normalize_video_url = field_validator("video_url")(_clean_video_url)
    _normalize_setup = field_validator("setup")(_clean_setup)


class ExerciseOut(ORMModel):
    id: int
    name: str
    muscle_group: str
    equipment: str
    rest_seconds_default: int
    is_custom: bool
    video_url: str | None = None
    setup: list[SetupEntry] = []

    @field_validator("setup", mode="before")
    @classmethod
    def _setup_never_null(cls, value: object) -> object:
        # the column is NULL for every exercise predating the feature
        return value or []


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
    # Where this lift actually fell in that day's session (1 = opened the
    # workout). Fatigue makes the 5th movement a different stimulus from the
    # 1st, so the app shows it next to the numbers.
    position: int
    total_exercises: int


# --- Bodyweight ---

class BodyweightIn(BaseModel):
    date: date
    weight_kg: float = Field(gt=0)


class BodyweightOut(ORMModel):
    id: int
    date: date
    weight_kg: float
