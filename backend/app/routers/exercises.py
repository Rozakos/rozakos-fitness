from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Exercise, User, Workout, WorkoutExercise, WorkoutSet
from ..schemas import ExerciseCreate, ExerciseHistoryEntry, ExerciseOut, SetOut
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
    return q.order_by(Exercise.muscle_group, Exercise.name).all()


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
    return exercise


@router.get("/{exercise_id}", response_model=ExerciseOut)
def get_exercise(
    exercise_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return get_visible_exercise(db, user, exercise_id)


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
        entries.append(
            ExerciseHistoryEntry(
                workout_id=we.workout_id,
                date=we.workout.started_at,
                sets=[SetOut.model_validate(s) for s in sets],
            )
        )
    return entries
