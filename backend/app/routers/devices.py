from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..live import manager
from ..models import ApiKey, User, WorkoutExercise, WorkoutSet
from ..schemas import ApiKeyCreate, ApiKeyCreated, ApiKeyOut, DeviceSetIn, SetIn, SetOut
from ..security import generate_api_key, get_current_user, get_device_user
from .exercises import get_visible_exercise
from .workouts import get_active_workout, next_set_number

router = APIRouter(tags=["devices"])


# --- API key management (phone app, JWT auth) ---

@router.get("/devices", response_model=list[ApiKeyOut])
def list_devices(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(ApiKey).filter(ApiKey.user_id == user.id).order_by(ApiKey.created_at).all()


@router.post("/devices", response_model=ApiKeyCreated, status_code=status.HTTP_201_CREATED)
def create_device(
    body: ApiKeyCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    plaintext, key_hash, prefix = generate_api_key()
    api_key = ApiKey(user_id=user.id, name=body.name, key_hash=key_hash, prefix=prefix)
    db.add(api_key)
    db.commit()
    db.refresh(api_key)
    return ApiKeyCreated(**ApiKeyOut.model_validate(api_key).model_dump(), key=plaintext)


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_device(
    device_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    api_key = (
        db.query(ApiKey).filter(ApiKey.id == device_id, ApiKey.user_id == user.id).first()
    )
    if api_key is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found")
    db.delete(api_key)
    db.commit()


# --- Device-facing endpoints (X-API-Key auth) ---

def log_device_set(db: Session, user: User, exercise_id: int, body: SetIn) -> WorkoutSet:
    """Log a set from a device into the user's active workout, creating the
    workout-exercise entry if the exercise isn't in the session yet."""
    workout = get_active_workout(db, user)
    if workout is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "No active workout")
    get_visible_exercise(db, user, exercise_id)
    we = next((e for e in workout.exercises if e.exercise_id == exercise_id), None)
    if we is None:
        we = WorkoutExercise(
            workout_id=workout.id,
            exercise_id=exercise_id,
            order=max((e.order for e in workout.exercises), default=-1) + 1,
        )
        db.add(we)
        db.flush()
    workout_set = WorkoutSet(
        workout_exercise_id=we.id,
        set_number=next_set_number(we),
        reps=body.reps,
        weight_kg=body.weight_kg,
        rpe=body.rpe,
        is_warmup=body.is_warmup,
        source="device",
    )
    db.add(workout_set)
    db.commit()
    db.refresh(workout_set)
    return workout_set


@router.post("/device/sets", response_model=SetOut, status_code=status.HTTP_201_CREATED)
async def device_log_set(
    body: DeviceSetIn, db: Session = Depends(get_db), user: User = Depends(get_device_user)
):
    workout_set = log_device_set(db, user, body.exercise_id, body)
    we = db.get(WorkoutExercise, workout_set.workout_exercise_id)
    await manager.broadcast(
        we.workout_id,
        {
            "type": "set_logged",
            "workout_exercise_id": we.id,
            "exercise_id": we.exercise_id,
            "set": SetOut.model_validate(workout_set).model_dump(mode="json"),
        },
    )
    return workout_set


@router.get("/device/active-workout")
def device_active_workout(db: Session = Depends(get_db), user: User = Depends(get_device_user)):
    """Lets a device discover whether a workout is running and which one."""
    workout = get_active_workout(db, user)
    if workout is None:
        return {"active": False, "workout_id": None}
    return {"active": True, "workout_id": workout.id}
