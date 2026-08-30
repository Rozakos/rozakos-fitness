from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import set_committed_value

from ..database import get_db
from ..models import Exercise, ExercisePreference, User, Workout, WorkoutExercise, WorkoutSet
from ..schemas import (
    ExerciseCreate,
    ExerciseHistoryEntry,
    ExerciseOut,
    ExerciseUpdate,
    SetOut,
)
from ..security import get_current_user

router = APIRouter(prefix="/exercises", tags=["exercises"])


def visible_exercises(db: Session, user: User):
    return db.query(Exercise).filter(
        or_(Exercise.is_custom.is_(False), Exercise.owner_id == user.id)
    )


def get_visible_exercise(db: Session, user: User, exercise_id: int) -> Exercise:
    exercise = visible_exercises(db, user).filter(Exercise.id == exercise_id).first()
    if exercise is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exercise not found")
    return exercise


def apply_exercise_preferences(
    db: Session, user: User, exercises: list[Exercise]
) -> list[Exercise]:
    """Overlay the user's fields without dirtying shared catalog rows."""
    builtins = {exercise.id: exercise for exercise in exercises if not exercise.is_custom}
    if not builtins:
        return exercises
    preferences = {
        preference.exercise_id: preference
        for preference in db.query(ExercisePreference)
        .filter(
            ExercisePreference.user_id == user.id,
            ExercisePreference.exercise_id.in_(builtins),
        )
        .all()
    }
    for exercise_id, exercise in builtins.items():
        preference = preferences.get(exercise_id)
        set_committed_value(exercise, "video_url", preference.video_url if preference else None)
        set_committed_value(exercise, "setup", preference.setup if preference else None)
    return exercises


@router.get("", response_model=list[ExerciseOut])
def list_exercises(
    search: str | None = None,
    muscle_group: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = visible_exercises(db, user)
    if search:
        q = q.filter(Exercise.name.ilike(f"%{search}%"))
    if muscle_group:
        q = q.filter(Exercise.muscle_group == muscle_group)
    exercises = q.order_by(Exercise.muscle_group, Exercise.name).all()
    return apply_exercise_preferences(db, user, exercises)


@router.post("", response_model=ExerciseOut, status_code=status.HTTP_201_CREATED)
def create_exercise(
    body: ExerciseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    exercise = Exercise(**body.model_dump(), is_custom=True, owner_id=user.id)
    db.add(exercise)
    db.commit()
    db.refresh(exercise)
    return apply_exercise_preferences(db, user, [exercise])[0]


@router.get("/{exercise_id}", response_model=ExerciseOut)
def get_exercise(
    exercise_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    exercise = get_visible_exercise(db, user, exercise_id)
    return apply_exercise_preferences(db, user, [exercise])[0]


@router.patch("/{exercise_id}", response_model=ExerciseOut)
def update_exercise(
    exercise_id: int,
    body: ExerciseUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Attach or clear the user's form-demo link and machine setup rows."""
    exercise = get_visible_exercise(db, user, exercise_id)
    target: Exercise | ExercisePreference = exercise
    if not exercise.is_custom:
        target = (
            db.query(ExercisePreference)
            .filter(
                ExercisePreference.user_id == user.id,
                ExercisePreference.exercise_id == exercise.id,
            )
            .first()
        )
        if target is None:
            requested_video = body.video_url if "video_url" in body.model_fields_set else None
            requested_setup = body.setup if "setup" in body.model_fields_set else None
            if requested_video is None and not requested_setup:
                return apply_exercise_preferences(db, user, [exercise])[0]
            target = ExercisePreference(user_id=user.id, exercise_id=exercise.id)
            db.add(target)
    if "video_url" in body.model_fields_set:
        target.video_url = body.video_url
    if "setup" in body.model_fields_set:
        target.setup = [entry.model_dump() for entry in body.setup] or None
    if isinstance(target, ExercisePreference) and target.video_url is None and target.setup is None:
        db.delete(target)
    db.commit()
    db.refresh(exercise)
    return apply_exercise_preferences(db, user, [exercise])[0]


def performed_order(workout: Workout) -> list[int]:
    """WorkoutExercise ids in the order they were actually *worked*, which is not
    `WorkoutExercise.order` — that is the session list the user reorders freely.
    The real sequence is when the first set of each landed."""
    worked = [we for we in workout.exercises if we.sets]
    worked.sort(key=lambda we: min(s.completed_at for s in we.sets))
    return [we.id for we in worked]


@router.get("/{exercise_id}/history", response_model=list[ExerciseHistoryEntry])
def exercise_history(
    exercise_id: int,
    limit: int = 10,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Most recent workouts (newest first) where this exercise was performed, with all
    logged sets — the first entry powers the "last time" ghost values in the app."""
    get_visible_exercise(db, user, exercise_id)
    rows = (
        db.query(WorkoutExercise)
        .join(Workout)
        .filter(
            Workout.user_id == user.id,
            WorkoutExercise.exercise_id == exercise_id,
            Workout.finished_at.isnot(None),
        )
        .order_by(Workout.started_at.desc())
        .limit(limit)
        .all()
    )
    entries = []
    for we in rows:
        sets = [s for s in we.sets]
        if not sets:
            continue
        order = performed_order(we.workout)
        entries.append(
            ExerciseHistoryEntry(
                workout_id=we.workout_id,
                date=we.workout.started_at,
                sets=[SetOut.model_validate(s) for s in sets],
                position=order.index(we.id) + 1,
                total_exercises=len(order),
            )
        )
    return entries
