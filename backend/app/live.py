"""Live workout channel.

One room per workout. The phone connects with its JWT (?token=...), devices
(e.g. a Raspi rep camera) connect with an API key (?api_key=...). Devices can
stream `rep` events (forwarded to everyone in the room) and `set_complete`
events (persisted, then broadcast as `set_logged` so the phone updates live).
"""

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from .database import SessionLocal
from .models import User, Workout
from .schemas import SetIn, SetOut
from .security import user_from_api_key, user_from_token

router = APIRouter()


class ConnectionManager:
    def __init__(self) -> None:
        self.rooms: dict[int, set[WebSocket]] = {}
        self.lock = asyncio.Lock()

    async def connect(self, workout_id: int, ws: WebSocket) -> None:
        await ws.accept()
        async with self.lock:
            self.rooms.setdefault(workout_id, set()).add(ws)

    async def disconnect(self, workout_id: int, ws: WebSocket) -> None:
        async with self.lock:
            room = self.rooms.get(workout_id)
            if room:
                room.discard(ws)
                if not room:
                    self.rooms.pop(workout_id, None)

    async def broadcast(self, workout_id: int, message: dict) -> None:
        room = self.rooms.get(workout_id, set())
        dead = []
        for ws in list(room):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(workout_id, ws)


manager = ConnectionManager()


def _authenticate(db: Session, token: str | None, api_key: str | None) -> tuple[User | None, str]:
    if token:
        return user_from_token(token, db), "app"
    if api_key:
        return user_from_api_key(api_key, db), "device"
    return None, ""


@router.websocket("/ws/workout/{workout_id}")
async def workout_channel(
    ws: WebSocket,
    workout_id: int,
    token: str | None = None,
    api_key: str | None = None,
):
    db = SessionLocal()
    try:
        user, role = _authenticate(db, token, api_key)
        if user is None:
            await ws.close(code=4401, reason="Unauthorized")
            return
        workout = db.get(Workout, workout_id)
        if workout is None or workout.user_id != user.id:
            await ws.close(code=4404, reason="Workout not found")
            return

        await manager.connect(workout_id, ws)
        try:
            while True:
                message = await ws.receive_json()
                msg_type = message.get("type")
                if msg_type == "rep" and role == "device":
                    await manager.broadcast(
                        workout_id,
                        {
                            "type": "rep",
                            "exercise_id": message.get("exercise_id"),
                            "count": message.get("count"),
                        },
                    )
                elif msg_type == "set_complete" and role == "device":
                    from .routers.devices import log_device_set

                    try:
                        body = SetIn(
                            reps=int(message.get("reps", 0)),
                            weight_kg=float(message.get("weight_kg", 0) or 0),
                            rpe=message.get("rpe"),
                            is_warmup=bool(message.get("is_warmup", False)),
                        )
                        workout_set = log_device_set(
                            db, user, int(message["exercise_id"]), body
                        )
                    except Exception as exc:
                        await ws.send_json({"type": "error", "detail": str(exc)})
                        continue
                    await manager.broadcast(
                        workout_id,
                        {
                            "type": "set_logged",
                            "workout_exercise_id": workout_set.workout_exercise_id,
                            "exercise_id": message["exercise_id"],
                            "set": SetOut.model_validate(workout_set).model_dump(mode="json"),
                        },
                    )
                elif msg_type == "ping":
                    await ws.send_json({"type": "pong"})
        except WebSocketDisconnect:
            pass
        finally:
            await manager.disconnect(workout_id, ws)
    finally:
        db.close()
