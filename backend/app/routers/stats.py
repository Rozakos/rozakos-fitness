from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Exercise, User, Workout, WorkoutExercise, WorkoutSet
from ..schemas import (
    ExerciseOut,
    ExercisePRs,
    ExerciseTrendPoint,
    RepPR,
    WeekVolume,
)
from ..security import get_current_user
from .exercises import get_visible_exercise

router = APIRouter(prefix="/stats", tags=["stats"])

MAX_PR_REPS = 12


def epley_1rm(weight_kg: float, reps: int) -> float:
    if reps <= 1:
        return weight_kg
    return weight_kg * (1 + reps / 30)


def working_sets_query(db: Session, user: User):
    return (
        db.query(WorkoutSet, WorkoutExercise, Workout)
        .join(WorkoutExercise, WorkoutSet.workout_exercise_id == WorkoutExercise.id)
        .join(Workout, WorkoutExercise.workout_id == Workout.id)
        .filter(
            Workout.user_id == user.id,
            Workout.finished_at.isnot(None),
            WorkoutSet.is_warmup.is_(False),
            WorkoutSet.reps > 0,
        )
    )


@router.get("/prs", response_model=list[ExercisePRs])
def personal_records(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Best weight lifted at each rep count (1..12) per exercise."""
    rows = working_sets_query(db, user).all()
    best: dict[int, dict[int, tuple[float, object]]] = defaultdict(dict)
    for workout_set, we, workout in rows:
        reps = min(workout_set.reps, MAX_PR_REPS)
        current = best[we.exercise_id].get(reps)
        if current is None or workout_set.weight_kg > current[0]:
            best[we.exercise_id][reps] = (workout_set.weight_kg, workout_set.completed_at)
    result = []
    for exercise_id, records in best.items():
        exercise = db.get(Exercise, exercise_id)
        result.append(
            ExercisePRs(
                exercise=ExerciseOut.model_validate(exercise),
                records=[
                    RepPR(reps=reps, weight_kg=weight, date=when)
                    for reps, (weight, when) in sorted(records.items())
                ],
            )
        )
    result.sort(key=lambda pr: pr.exercise.name)
    return result


@router.get("/volume", response_model=list[WeekVolume])
def weekly_volume(
    weeks: int = 12, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Total training volume (reps x weight) per ISO week, split by muscle group."""
    cutoff = date.today() - timedelta(weeks=weeks)
    rows = working_sets_query(db, user).filter(Workout.started_at >= cutoff).all()
    weeks_map: dict[date, dict] = {}
    for workout_set, we, workout in rows:
        day = workout.started_at.date()
        week_start = day - timedelta(days=day.weekday())
        entry = weeks_map.setdefault(
            week_start, {"total": 0.0, "by_muscle": defaultdict(float)}
        )
        volume = workout_set.reps * workout_set.weight_kg
        entry["total"] += volume
        entry["by_muscle"][we.exercise.muscle_group] += volume
    return [
        WeekVolume(
            week_start=week_start,
            total_volume_kg=round(data["total"], 1),
            by_muscle_group={k: round(v, 1) for k, v in data["by_muscle"].items()},
        )
        for week_start, data in sorted(weeks_map.items())
    ]


@router.get("/exercise/{exercise_id}", response_model=list[ExerciseTrendPoint])
def exercise_trend(
    exercise_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Per-workout trend for one exercise: best estimated 1RM (Epley), top weight, volume."""
    get_visible_exercise(db, user, exercise_id)
    rows = (
        working_sets_query(db, user)
        .filter(WorkoutExercise.exercise_id == exercise_id)
        .order_by(Workout.started_at)
        .all()
    )
    by_workout: dict[int, dict] = {}
    for workout_set, we, workout in rows:
        entry = by_workout.setdefault(
            workout.id,
            {"date": workout.started_at, "best_1rm": 0.0, "top_weight": 0.0, "volume": 0.0},
        )
        entry["best_1rm"] = max(entry["best_1rm"], epley_1rm(workout_set.weight_kg, workout_set.reps))
        entry["top_weight"] = max(entry["top_weight"], workout_set.weight_kg)
        entry["volume"] += workout_set.reps * workout_set.weight_kg
    return [
        ExerciseTrendPoint(
            workout_id=workout_id,
            date=data["date"],
            best_est_1rm=round(data["best_1rm"], 1),
            top_weight_kg=data["top_weight"],
            total_volume_kg=round(data["volume"], 1),
        )
        for workout_id, data in by_workout.items()
    ]
