from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    BodyweightEntry,
    Exercise,
    ExercisePreference,
    LocalDataImport,
    Routine,
    RoutineExercise,
    User,
    Workout,
    WorkoutExercise,
    WorkoutSet,
)
from ..schemas import LocalDataImportRequest, LocalDataImportResult
from ..security import get_current_user

router = APIRouter(prefix="/sync", tags=["sync"])


def _require_unique(values: list[int], label: str) -> None:
    if len(values) != len(set(values)):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"Duplicate {label} local_id",
        )


def _exercise_mapping(
    db: Session, user: User, body: LocalDataImportRequest
) -> tuple[dict[int, int], int]:
    custom_ids = [exercise.local_id for exercise in body.custom_exercises]
    _require_unique(custom_ids, "custom exercise")
    custom_id_set = set(custom_ids)

    referenced_ids = {
        row.exercise_id
        for routine in body.routines
        for row in routine.exercises
    }
    referenced_ids.update(
        row.exercise_id
        for workout in body.workouts
        for row in workout.exercises
    )
    referenced_ids.update(preference.exercise_id for preference in body.exercise_preferences)

    builtin_ids = referenced_ids - custom_id_set
    visible_builtins = {
        exercise.id
        for exercise in db.query(Exercise)
        .filter(Exercise.id.in_(builtin_ids), Exercise.is_custom.is_(False))
        .all()
    }
    missing = sorted(builtin_ids - visible_builtins)
    if missing:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"Unknown built-in exercise id: {missing[0]}",
        )

    mapping = {exercise_id: exercise_id for exercise_id in visible_builtins}
    for item in body.custom_exercises:
        exercise = Exercise(
            name=item.name,
            muscle_group=item.muscle_group,
            equipment=item.equipment,
            rest_seconds_default=item.rest_seconds_default,
            is_custom=True,
            owner_id=user.id,
            video_url=item.video_url,
            setup=[entry.model_dump() for entry in (item.setup or [])] or None,
        )
        db.add(exercise)
        db.flush()
        mapping[item.local_id] = exercise.id
    return mapping, len(body.custom_exercises)


def _import_preferences(
    db: Session,
    user: User,
    body: LocalDataImportRequest,
    exercise_ids: dict[int, int],
) -> int:
    imported = 0
    seen: set[int] = set()
    for item in body.exercise_preferences:
        server_exercise_id = exercise_ids[item.exercise_id]
        if server_exercise_id in seen:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                f"Duplicate preference for exercise id: {item.exercise_id}",
            )
        seen.add(server_exercise_id)
        exercise = db.get(Exercise, server_exercise_id)
        if exercise is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown exercise")

        video_url = item.video_url
        setup = [entry.model_dump() for entry in (item.setup or [])] or None
        if exercise.is_custom:
            # The custom-exercise payload normally carries these values. Accept
            # older clients that send them as a separate preference too.
            if exercise.video_url is None:
                exercise.video_url = video_url
            if exercise.setup is None:
                exercise.setup = setup
            continue
        if video_url is None and setup is None:
            continue
        existing = (
            db.query(ExercisePreference)
            .filter(
                ExercisePreference.user_id == user.id,
                ExercisePreference.exercise_id == server_exercise_id,
            )
            .first()
        )
        # Existing cloud preferences win during a merge.
        if existing is None:
            db.add(
                ExercisePreference(
                    user_id=user.id,
                    exercise_id=server_exercise_id,
                    video_url=video_url,
                    setup=setup,
                )
            )
            imported += 1
    return imported


@router.post("/import-local", response_model=LocalDataImportResult)
def import_local_data(
    body: LocalDataImportRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    previous = (
        db.query(LocalDataImport)
        .filter(
            LocalDataImport.user_id == user.id,
            LocalDataImport.import_id == body.import_id,
        )
        .first()
    )
    if previous is not None:
        return LocalDataImportResult(already_imported=True, **previous.result)

    routine_local_ids = [routine.local_id for routine in body.routines]
    workout_local_ids = [workout.local_id for workout in body.workouts]
    _require_unique(routine_local_ids, "routine")
    _require_unique(workout_local_ids, "workout")

    local_active = [workout for workout in body.workouts if workout.finished_at is None]
    if len(local_active) > 1:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Local data contains more than one active workout",
        )
    cloud_active = (
        db.query(Workout)
        .filter(Workout.user_id == user.id, Workout.finished_at.is_(None))
        .first()
    )
    if local_active and cloud_active is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Finish or discard one active workout before merging local data",
        )

    known_routines = set(routine_local_ids)
    for workout in body.workouts:
        if workout.routine_id is not None and workout.routine_id not in known_routines:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                f"Unknown local routine id: {workout.routine_id}",
            )
        for workout_exercise in workout.exercises:
            set_numbers = [workout_set.set_number for workout_set in workout_exercise.sets]
            if len(set_numbers) != len(set(set_numbers)):
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_CONTENT,
                    "Duplicate set_number in a workout exercise",
                )

    exercise_ids, custom_count = _exercise_mapping(db, user, body)
    preference_count = _import_preferences(db, user, body, exercise_ids)

    routine_ids: dict[int, int] = {}
    for item in body.routines:
        routine = Routine(user_id=user.id, name=item.name, created_at=item.created_at)
        for index, row in enumerate(item.exercises):
            routine.exercises.append(
                RoutineExercise(
                    exercise_id=exercise_ids[row.exercise_id],
                    order=row.order if row.order else index,
                    superset_group=row.superset_group,
                    target_sets=row.target_sets,
                    target_reps_min=row.target_reps_min,
                    target_reps_max=row.target_reps_max,
                )
            )
        db.add(routine)
        db.flush()
        routine_ids[item.local_id] = routine.id

    set_count = 0
    for item in body.workouts:
        workout = Workout(
            user_id=user.id,
            routine_id=routine_ids.get(item.routine_id),
            started_at=item.started_at,
            finished_at=item.finished_at,
            notes=item.notes,
        )
        for row in item.exercises:
            # Match normal finish behavior: skipped routine placeholders do not
            # become permanent history rows.
            if item.finished_at is not None and not row.sets:
                continue
            workout_exercise = WorkoutExercise(
                exercise_id=exercise_ids[row.exercise_id],
                order=row.order,
                superset_group=row.superset_group,
                target_reps_min=row.target_reps_min,
                target_reps_max=row.target_reps_max,
            )
            for workout_set in row.sets:
                workout_exercise.sets.append(
                    WorkoutSet(
                        set_number=workout_set.set_number,
                        reps=workout_set.reps,
                        weight_kg=workout_set.weight_kg,
                        rpe=workout_set.rpe,
                        is_warmup=workout_set.is_warmup,
                        completed_at=workout_set.completed_at,
                        source=workout_set.source,
                    )
                )
                set_count += 1
            workout.exercises.append(workout_exercise)
        db.add(workout)

    existing_bodyweight_dates = {
        entry.date
        for entry in db.query(BodyweightEntry)
        .filter(BodyweightEntry.user_id == user.id)
        .all()
    }
    bodyweight_by_date = {entry.date: entry for entry in body.bodyweight}
    bodyweight_count = 0
    for entry_date, entry in bodyweight_by_date.items():
        # Existing cloud measurements win during a merge.
        if entry_date in existing_bodyweight_dates:
            continue
        db.add(
            BodyweightEntry(
                user_id=user.id,
                date=entry.date,
                weight_kg=entry.weight_kg,
            )
        )
        bodyweight_count += 1

    counts = {
        "custom_exercises": custom_count,
        "exercise_preferences": preference_count,
        "routines": len(body.routines),
        "workouts": len(body.workouts),
        "sets": set_count,
        "bodyweight": bodyweight_count,
    }
    db.add(
        LocalDataImport(
            user_id=user.id,
            import_id=body.import_id,
            result=counts,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        # Two identical retries can pass the first lookup concurrently. The
        # unique import key rolls the losing transaction back, including all
        # entities it staged; return the winner's recorded result.
        db.rollback()
        previous = (
            db.query(LocalDataImport)
            .filter(
                LocalDataImport.user_id == user.id,
                LocalDataImport.import_id == body.import_id,
            )
            .first()
        )
        if previous is None:
            raise
        return LocalDataImportResult(already_imported=True, **previous.result)
    return LocalDataImportResult(already_imported=False, **counts)
