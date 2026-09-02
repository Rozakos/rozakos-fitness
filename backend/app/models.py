from datetime import date, datetime, timezone

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    auth_version: Mapped[int] = mapped_column(Integer, default=0)

    @property
    def email_verified(self) -> bool:
        return self.email_verified_at is not None

    api_keys: Mapped[list["ApiKey"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    workouts: Mapped[list["Workout"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    routines: Mapped[list["Routine"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    bodyweight_entries: Mapped[list["BodyweightEntry"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    custom_exercises: Mapped[list["Exercise"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan", foreign_keys="Exercise.owner_id"
    )
    exercise_preferences: Mapped[list["ExercisePreference"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    local_data_imports: Mapped[list["LocalDataImport"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    prefix: Mapped[str] = mapped_column(String(12))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="api_keys")


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    muscle_group: Mapped[str] = mapped_column(String(50), index=True)
    equipment: Mapped[str] = mapped_column(String(50), default="barbell")
    rest_seconds_default: Mapped[int] = mapped_column(Integer, default=120)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    # Custom-exercise values live here. Built-in values are overlaid from
    # ExercisePreference so accounts never share personal links or setup rows.
    video_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Machine setup recorded once and read back at the rack: a list of
    # {"label": ..., "value": ...} rows ("Seat height" / "4").
    setup: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)

    owner: Mapped[User | None] = relationship(back_populates="custom_exercises", foreign_keys=[owner_id])


class ExercisePreference(Base):
    __tablename__ = "exercise_preferences"
    __table_args__ = (UniqueConstraint("user_id", "exercise_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"), index=True)
    video_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    setup: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)

    user: Mapped[User] = relationship(back_populates="exercise_preferences")


class Routine(Base):
    __tablename__ = "routines"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship(back_populates="routines")
    exercises: Mapped[list["RoutineExercise"]] = relationship(
        back_populates="routine", cascade="all, delete-orphan", order_by="RoutineExercise.order"
    )


class RoutineExercise(Base):
    __tablename__ = "routine_exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    routine_id: Mapped[int] = mapped_column(ForeignKey("routines.id"), index=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"))
    order: Mapped[int] = mapped_column(Integer, default=0)
    superset_group: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_sets: Mapped[int] = mapped_column(Integer, default=3)
    target_reps_min: Mapped[int] = mapped_column(Integer, default=8)
    target_reps_max: Mapped[int] = mapped_column(Integer, default=12)

    routine: Mapped[Routine] = relationship(back_populates="exercises")
    exercise: Mapped[Exercise] = relationship()


class Workout(Base):
    __tablename__ = "workouts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    routine_id: Mapped[int | None] = mapped_column(ForeignKey("routines.id"), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped[User] = relationship(back_populates="workouts")
    exercises: Mapped[list["WorkoutExercise"]] = relationship(
        back_populates="workout", cascade="all, delete-orphan", order_by="WorkoutExercise.order"
    )


class WorkoutExercise(Base):
    __tablename__ = "workout_exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    workout_id: Mapped[int] = mapped_column(ForeignKey("workouts.id"), index=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"), index=True)
    order: Mapped[int] = mapped_column(Integer, default=0)
    superset_group: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # copied from the routine at start so the app can show targets + progression hints
    target_reps_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_reps_max: Mapped[int | None] = mapped_column(Integer, nullable=True)

    workout: Mapped[Workout] = relationship(back_populates="exercises")
    exercise: Mapped[Exercise] = relationship()
    sets: Mapped[list["WorkoutSet"]] = relationship(
        back_populates="workout_exercise", cascade="all, delete-orphan", order_by="WorkoutSet.set_number"
    )


class WorkoutSet(Base):
    __tablename__ = "workout_sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    workout_exercise_id: Mapped[int] = mapped_column(ForeignKey("workout_exercises.id"), index=True)
    set_number: Mapped[int] = mapped_column(Integer, default=1)
    reps: Mapped[int] = mapped_column(Integer)
    weight_kg: Mapped[float] = mapped_column(Float, default=0.0)
    rpe: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_warmup: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    source: Mapped[str] = mapped_column(String(10), default="manual")  # manual | device

    workout_exercise: Mapped[WorkoutExercise] = relationship(back_populates="sets")


class BodyweightEntry(Base):
    __tablename__ = "bodyweight_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    weight_kg: Mapped[float] = mapped_column(Float)

    user: Mapped[User] = relationship(back_populates="bodyweight_entries")


class LocalDataImport(Base):
    """Completed phone-to-account imports.

    The client keeps one import id for a local database revision. Persisting the
    result makes retrying after a lost HTTP response safe: the same history is
    never inserted twice.
    """

    __tablename__ = "local_data_imports"
    __table_args__ = (UniqueConstraint("user_id", "import_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    import_id: Mapped[str] = mapped_column(String(100))
    result: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship(back_populates="local_data_imports")
