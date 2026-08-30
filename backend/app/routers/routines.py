from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Routine, RoutineExercise, User
from ..schemas import RoutineIn, RoutineOut
from ..security import get_current_user
from .exercises import apply_exercise_preferences, get_visible_exercise

router = APIRouter(prefix="/routines", tags=["routines"])


def with_exercise_preferences(db: Session, user: User, routines: list[Routine]) -> list[Routine]:
    apply_exercise_preferences(
        db, user, [row.exercise for routine in routines for row in routine.exercises]
    )
    return routines


def get_own_routine(db: Session, user: User, routine_id: int) -> Routine:
    routine = (
        db.query(Routine).filter(Routine.id == routine_id, Routine.user_id == user.id).first()
    )
    if routine is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Routine not found")
    return routine


def apply_exercises(db: Session, user: User, routine: Routine, body: RoutineIn) -> None:
    routine.exercises.clear()
    for i, ex in enumerate(body.exercises):
        get_visible_exercise(db, user, ex.exercise_id)
        routine.exercises.append(
            RoutineExercise(
                exercise_id=ex.exercise_id,
                order=ex.order if ex.order else i,
                superset_group=ex.superset_group,
                target_sets=ex.target_sets,
                target_reps_min=ex.target_reps_min,
                target_reps_max=ex.target_reps_max,
            )
        )


@router.get("", response_model=list[RoutineOut])
def list_routines(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    routines = (
        db.query(Routine)
        .filter(Routine.user_id == user.id)
        .order_by(Routine.created_at.desc())
        .all()
    )
    return with_exercise_preferences(db, user, routines)


@router.post("", response_model=RoutineOut, status_code=status.HTTP_201_CREATED)
def create_routine(
    body: RoutineIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    routine = Routine(user_id=user.id, name=body.name)
    db.add(routine)
    apply_exercises(db, user, routine, body)
    db.commit()
    db.refresh(routine)
    return with_exercise_preferences(db, user, [routine])[0]


@router.get("/{routine_id}", response_model=RoutineOut)
def get_routine(
    routine_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    routine = get_own_routine(db, user, routine_id)
    return with_exercise_preferences(db, user, [routine])[0]


@router.put("/{routine_id}", response_model=RoutineOut)
def update_routine(
    routine_id: int,
    body: RoutineIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    routine = get_own_routine(db, user, routine_id)
    routine.name = body.name
    apply_exercises(db, user, routine, body)
    db.commit()
    db.refresh(routine)
    return with_exercise_preferences(db, user, [routine])[0]


@router.delete("/{routine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_routine(
    routine_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    routine = get_own_routine(db, user, routine_id)
    db.delete(routine)
    db.commit()
