from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..live import manager
from ..models import Routine, User, Workout, WorkoutExercise, WorkoutSet
from ..schemas import (
    SetIn,
    SetOut,
    SetUpdate,
    WorkoutExerciseAdd,
    WorkoutExerciseOut,
    WorkoutExerciseUpdate,
    WorkoutOut,
    WorkoutStart,
    WorkoutSummary,
    WorkoutUpdate,
)
from ..security import get_current_user
from .exercises import get_visible_exercise

router = APIRouter(prefix="/workouts", tags=["workouts"])


def get_own_workout(db: Session, user: User, workout_id: int) -> Workout:
    workout = (
        db.query(Workout).filter(Workout.id == workout_id, Workout.user_id == user.id).first()
    )
    if workout is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workout not found")
    return workout


def get_active_workout(db: Session, user: User) -> Workout | None:
    return (
        db.query(Workout)
        .filter(Workout.user_id == user.id, Workout.finished_at.is_(None))
        .order_by(Workout.started_at.desc())
        .first()
    )


def next_set_number(workout_exercise: WorkoutExercise) -> int:
    return max((s.set_number for s in workout_exercise.sets), default=0) + 1


@router.post("", response_model=WorkoutOut, status_code=status.HTTP_201_CREATED)
def start_workout(
    body: WorkoutStart, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    if get_active_workout(db, user) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A workout is already in progress")
    workout = Workout(user_id=user.id, routine_id=body.routine_id, notes=body.notes)
    if body.routine_id is not None:
        routine = (
            db.query(Routine)
            .filter(Routine.id == body.routine_id, Routine.user_id == user.id)
            .first()
        )
        if routine is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Routine not found")
        for re in routine.exercises:
            workout.exercises.append(
                WorkoutExercise(
                    exercise_id=re.exercise_id,
                    order=re.order,
                    superset_group=re.superset_group,
                )
            )
    db.add(workout)
    db.commit()
    db.refresh(workout)
    return workout


@router.get("", response_model=list[WorkoutSummary])
def list_workouts(
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return (
        db.query(Workout)
        .filter(Workout.user_id == user.id, Workout.finished_at.isnot(None))
        .order_by(Workout.started_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get("/active", response_model=WorkoutOut | None)
def active_workout(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return get_active_workout(db, user)


@router.get("/{workout_id}", response_model=WorkoutOut)
def get_workout(
    workout_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    return get_own_workout(db, user, workout_id)


@router.patch("/{workout_id}", response_model=WorkoutOut)
def update_workout(
    workout_id: int,
    body: WorkoutUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    workout = get_own_workout(db, user, workout_id)
    if "notes" in body.model_fields_set:
        workout.notes = body.notes
    db.commit()
    db.refresh(workout)
    return workout


@router.post("/{workout_id}/finish", response_model=WorkoutOut)
def finish_workout(
    workout_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    workout = get_own_workout(db, user, workout_id)
    if workout.finished_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Workout already finished")
    # Drop exercises where nothing was logged (e.g. pre-filled from a routine, skipped)
    workout.exercises = [we for we in workout.exercises if we.sets]
    workout.finished_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(workout)
    return workout


@router.delete("/{workout_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workout(
    workout_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    workout = get_own_workout(db, user, workout_id)
    db.delete(workout)
    db.commit()


@router.post(
    "/{workout_id}/exercises",
    response_model=WorkoutExerciseOut,
    status_code=status.HTTP_201_CREATED,
)
def add_exercise(
    workout_id: int,
    body: WorkoutExerciseAdd,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    workout = get_own_workout(db, user, workout_id)
    get_visible_exercise(db, user, body.exercise_id)
    we = WorkoutExercise(
        workout_id=workout.id,
        exercise_id=body.exercise_id,
        order=max((e.order for e in workout.exercises), default=-1) + 1,
        superset_group=body.superset_group,
    )
    db.add(we)
    db.commit()
    db.refresh(we)
    return we


def get_own_workout_exercise(
    db: Session, user: User, workout_id: int, we_id: int
) -> WorkoutExercise:
    get_own_workout(db, user, workout_id)
    we = (
        db.query(WorkoutExercise)
        .filter(WorkoutExercise.id == we_id, WorkoutExercise.workout_id == workout_id)
        .first()
    )
    if we is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workout exercise not found")
    return we


@router.patch("/{workout_id}/exercises/{we_id}", response_model=WorkoutExerciseOut)
def update_exercise(
    workout_id: int,
    we_id: int,
    body: WorkoutExerciseUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    we = get_own_workout_exercise(db, user, workout_id, we_id)
    if body.exercise_id is not None:
        get_visible_exercise(db, user, body.exercise_id)
        we.exercise_id = body.exercise_id
    if body.order is not None:
        we.order = body.order
    if "superset_group" in body.model_fields_set:
        we.superset_group = body.superset_group
    db.commit()
    db.refresh(we)
    return we


@router.delete("/{workout_id}/exercises/{we_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_exercise(
    workout_id: int,
    we_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    we = get_own_workout_exercise(db, user, workout_id, we_id)
    db.delete(we)
    db.commit()


@router.post(
    "/{workout_id}/exercises/{we_id}/sets",
    response_model=SetOut,
    status_code=status.HTTP_201_CREATED,
)
async def log_set(
    workout_id: int,
    we_id: int,
    body: SetIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    we = get_own_workout_exercise(db, user, workout_id, we_id)
    workout_set = WorkoutSet(
        workout_exercise_id=we.id,
        set_number=next_set_number(we),
        reps=body.reps,
        weight_kg=body.weight_kg,
        rpe=body.rpe,
        is_warmup=body.is_warmup,
        source="manual",
    )
    db.add(workout_set)
    db.commit()
    db.refresh(workout_set)
    await manager.broadcast(
        workout_id,
        {
            "type": "set_logged",
            "workout_exercise_id": we.id,
            "exercise_id": we.exercise_id,
            "set": SetOut.model_validate(workout_set).model_dump(mode="json"),
        },
    )
    return workout_set


def get_own_set(db: Session, user: User, workout_id: int, we_id: int, set_id: int) -> WorkoutSet:
    get_own_workout_exercise(db, user, workout_id, we_id)
    workout_set = (
        db.query(WorkoutSet)
        .filter(WorkoutSet.id == set_id, WorkoutSet.workout_exercise_id == we_id)
        .first()
    )
    if workout_set is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Set not found")
    return workout_set


@router.patch("/{workout_id}/exercises/{we_id}/sets/{set_id}", response_model=SetOut)
def update_set(
    workout_id: int,
    we_id: int,
    set_id: int,
    body: SetUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    workout_set = get_own_set(db, user, workout_id, we_id, set_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(workout_set, field, value)
    db.commit()
    db.refresh(workout_set)
    return workout_set


@router.delete(
    "/{workout_id}/exercises/{we_id}/sets/{set_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_set(
    workout_id: int,
    we_id: int,
    set_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    workout_set = get_own_set(db, user, workout_id, we_id, set_id)
    db.delete(workout_set)
    db.commit()
