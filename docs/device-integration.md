# Building a Device for Rozakos Fitness

Anything that can speak HTTP + WebSocket can log training data: a Raspberry Pi with a camera,
an ESP32 on a barbell sleeve, a load cell under a plate stack. This guide walks the whole
integration; the full endpoint/message spec is in [api.md](api.md).

## 1. Get an API key

In the app: **Profile → Manage devices & API keys → name it → Create**. The `rzk_...` key is
shown exactly once — put it in the device's config. Revoking the key in the app kills the
device's access instantly.

Send it on every request:

```
X-API-Key: rzk_xxxxxxxxxxxxxxxx
```

## 2. Wait for a workout

Devices never start workouts — the human does, on their phone. Poll until one exists:

```python
import requests, time

def wait_for_workout(server, key):
    while True:
        r = requests.get(f"{server}/device/active-workout", headers={"X-API-Key": key})
        data = r.json()
        if data["active"]:
            return data["workout_id"]
        time.sleep(3)
```

## 3a. Simplest integration: REST only

Fire one request per completed set — the phone updates in real time anyway (the server
broadcasts every persisted set to the live channel):

```python
requests.post(
    f"{server}/device/sets",
    headers={"X-API-Key": key},
    json={"exercise_id": 1, "reps": 8, "weight_kg": 60},
)
```

If the exercise isn't in the session yet, the server adds it. A `409` means the workout
ended — go back to step 2.

## 3b. Full integration: live WebSocket

Connect to the workout's room and stream individual reps as they happen; the lifter sees a
live counter on the set they're performing:

```python
import asyncio, json, websockets

async def stream_set(server_ws, key, workout_id, exercise_id, reps, weight):
    url = f"{server_ws}/ws/workout/{workout_id}?api_key={key}"
    async with websockets.connect(url) as ws:
        for n in range(1, reps + 1):
            ...  # detect one rep
            await ws.send(json.dumps({"type": "rep", "exercise_id": exercise_id, "count": n}))
        await ws.send(json.dumps({
            "type": "set_complete", "exercise_id": exercise_id,
            "reps": reps, "weight_kg": weight,
        }))
```

`rep` events are transient (display only). `set_complete` is what persists — treat it as the
transaction. If the socket drops mid-set, fall back to `POST /device/sets` with the final count.

## 4. Reference implementations

| File | What it shows |
|---|---|
| `examples/raspi_rep_counter.py` | The full flow with a simulated detector — start here, needs no hardware |
| `examples/raspi_camera_mediapipe.py` | Real camera rep counting: MediaPipe pose → joint angle → hysteresis state machine → idle-based set finalization |

### Calibrating the camera counter

- Run on a desktop with `--preview` first: it draws the skeleton and prints the live joint angle.
- Watch the angle through a few slow reps, then set `--angle-low` just above your bottom
  position and `--angle-high` just below lockout. Defaults (70°/150°) suit curls and presses.
- Pick the joint that actually cycles: `elbow_*` for curls/presses/rows, `knee_*` for
  squats/leg press, `hip_right` for hinges.
- `--idle-seconds` (default 20) is the quiet period that finalizes a set — shorten it for
  fast-paced circuits, lengthen it if you pause mid-set.

## Gotchas

- **Weights are always kilograms** on the wire, regardless of the app's display unit.
- One active workout per user; `exercise_id` must be one the user can see (built-in or their own custom).
- A rejected WebSocket (bad key, foreign workout) fails at the handshake with HTTP 403 —
  check your key before blaming the network.
- Keys are hashed server-side; if a device loses its key, revoke and create a new one.
