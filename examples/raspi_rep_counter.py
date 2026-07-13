"""Example embedded client: a Raspberry Pi rep counter for Rozakos Fitness.

Simulates a camera-based rep detector. In a real deployment you'd replace
`simulate_set()` with your CV pipeline (e.g. MediaPipe pose estimation) and
emit a rep event every time a full rep is detected.

Flow:
  1. Authenticate with a device API key (create one in the app: Profile > Devices).
  2. Poll GET /device/active-workout until the user starts a workout on their phone.
  3. Open the workout's WebSocket channel and stream `rep` events live.
  4. When the set ends, send `set_complete` — the server persists it and the
     phone UI updates instantly.

Usage:
  pip install requests websockets
  python raspi_rep_counter.py --server http://192.168.1.50:8000 \
      --api-key rzk_xxxxxxxx --exercise-id 1 --weight 60
"""

import argparse
import asyncio
import json
import random
import time

import requests
import websockets


def wait_for_active_workout(server: str, headers: dict) -> int:
    print("Waiting for an active workout (start one on your phone)...")
    while True:
        res = requests.get(f"{server}/device/active-workout", headers=headers, timeout=10)
        res.raise_for_status()
        data = res.json()
        if data["active"]:
            print(f"Active workout found: #{data['workout_id']}")
            return data["workout_id"]
        time.sleep(3)


async def simulate_set(ws, exercise_id: int, weight_kg: float, target_reps: int) -> None:
    """Pretend the camera sees one rep every 2-4 seconds, then completes the set."""
    for rep in range(1, target_reps + 1):
        await asyncio.sleep(random.uniform(2, 4))
        await ws.send(json.dumps({"type": "rep", "exercise_id": exercise_id, "count": rep}))
        print(f"  rep {rep}/{target_reps}")
    await ws.send(
        json.dumps(
            {
                "type": "set_complete",
                "exercise_id": exercise_id,
                "reps": target_reps,
                "weight_kg": weight_kg,
            }
        )
    )
    print(f"Set complete: {target_reps} reps @ {weight_kg} kg (logged to server)")


async def run(server: str, api_key: str, exercise_id: int, weight_kg: float, sets: int) -> None:
    headers = {"X-API-Key": api_key}
    workout_id = wait_for_active_workout(server, headers)

    ws_url = server.replace("http://", "ws://").replace("https://", "wss://")
    async with websockets.connect(
        f"{ws_url}/ws/workout/{workout_id}?api_key={api_key}"
    ) as ws:
        print("Connected to live workout channel")
        for set_number in range(1, sets + 1):
            print(f"Set {set_number}/{sets} — detecting reps...")
            await simulate_set(ws, exercise_id, weight_kg, target_reps=random.randint(6, 10))
            if set_number < sets:
                rest = 60
                print(f"Resting {rest}s...")
                await asyncio.sleep(rest)
    print("Done. Check the workout on your phone!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulated Raspi rep counter")
    parser.add_argument("--server", default="http://127.0.0.1:8000")
    parser.add_argument("--api-key", required=True, help="Device API key (rzk_...)")
    parser.add_argument("--exercise-id", type=int, default=1)
    parser.add_argument("--weight", type=float, default=60.0)
    parser.add_argument("--sets", type=int, default=3)
    args = parser.parse_args()
    asyncio.run(run(args.server, args.api_key, args.exercise_id, args.weight, args.sets))
