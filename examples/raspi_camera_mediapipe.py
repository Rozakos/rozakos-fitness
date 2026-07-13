"""Real camera rep counter for Rozakos Fitness — MediaPipe Pose edition.

Counts reps from joint-angle cycles (e.g. the elbow for curls/presses, the knee
for squats) using a hysteresis state machine, and streams them live into your
active workout exactly like the simulator (`raspi_rep_counter.py`).

Hardware/deps (on the Pi):
    pip install mediapipe opencv-python requests websockets
    # Pi Camera Module: ensure libcamera/V4L2 is enabled so cv2.VideoCapture(0) works

Usage:
    python raspi_camera_mediapipe.py --server http://192.168.1.50:8000 \
        --api-key rzk_xxx --exercise-id 28 --weight 12.5 --joint elbow_right \
        --idle-seconds 20

Rep detection:
    - "down" when the joint angle drops below --angle-low (default 70°)
    - a rep completes when it then rises above --angle-high (default 150°)
    - after --idle-seconds with no reps, the set is finalized via `set_complete`
      (persisted server-side, phone updates instantly), and counting restarts
      for the next set.

NOTE: tune --angle-low/--angle-high per movement. Run with --preview on a
desktop to see the skeleton overlay and printed angles while calibrating.
"""

import argparse
import asyncio
import json
import math
import time

import cv2
import mediapipe as mp
import requests
import websockets

POSE = mp.solutions.pose.PoseLandmark

# joint name -> (first, vertex, last) landmark triple; the angle is at the vertex
JOINTS = {
    "elbow_right": (POSE.RIGHT_SHOULDER, POSE.RIGHT_ELBOW, POSE.RIGHT_WRIST),
    "elbow_left": (POSE.LEFT_SHOULDER, POSE.LEFT_ELBOW, POSE.LEFT_WRIST),
    "knee_right": (POSE.RIGHT_HIP, POSE.RIGHT_KNEE, POSE.RIGHT_ANKLE),
    "knee_left": (POSE.LEFT_HIP, POSE.LEFT_KNEE, POSE.LEFT_ANKLE),
    "hip_right": (POSE.RIGHT_SHOULDER, POSE.RIGHT_HIP, POSE.RIGHT_KNEE),
}


def angle_deg(a, b, c) -> float:
    """Angle ABC in degrees from three (x, y) landmark points."""
    ang = math.degrees(
        math.atan2(c.y - b.y, c.x - b.x) - math.atan2(a.y - b.y, a.x - b.x)
    )
    ang = abs(ang)
    return 360 - ang if ang > 180 else ang


class RepCounter:
    """Hysteresis state machine: below `low` arms the rep, above `high` counts it."""

    def __init__(self, low: float, high: float) -> None:
        self.low = low
        self.high = high
        self.armed = False
        self.count = 0

    def update(self, angle: float) -> bool:
        if angle < self.low:
            self.armed = True
        elif angle > self.high and self.armed:
            self.armed = False
            self.count += 1
            return True
        return False

    def reset(self) -> None:
        self.armed = False
        self.count = 0


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


async def run(args: argparse.Namespace) -> None:
    headers = {"X-API-Key": args.api_key}
    workout_id = wait_for_active_workout(args.server, headers)

    landmarks_triple = JOINTS[args.joint]
    counter = RepCounter(args.angle_low, args.angle_high)
    last_rep_at: float | None = None

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise SystemExit(f"Cannot open camera index {args.camera}")

    ws_url = args.server.replace("http://", "ws://").replace("https://", "wss://")
    async with websockets.connect(
        f"{ws_url}/ws/workout/{workout_id}?api_key={args.api_key}"
    ) as ws:
        print(f"Connected. Counting {args.joint} reps — do your set!")
        with mp.solutions.pose.Pose(model_complexity=0) as pose:
            while True:
                ok, frame = cap.read()
                if not ok:
                    print("Camera read failed, stopping.")
                    break
                result = pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))

                if result.pose_landmarks:
                    lm = result.pose_landmarks.landmark
                    a, b, c = (lm[j.value] for j in landmarks_triple)
                    angle = angle_deg(a, b, c)

                    if counter.update(angle):
                        last_rep_at = time.monotonic()
                        print(f"  rep {counter.count} (angle {angle:.0f} deg)")
                        await ws.send(
                            json.dumps(
                                {
                                    "type": "rep",
                                    "exercise_id": args.exercise_id,
                                    "count": counter.count,
                                }
                            )
                        )

                    if args.preview:
                        mp.solutions.drawing_utils.draw_landmarks(
                            frame, result.pose_landmarks, mp.solutions.pose.POSE_CONNECTIONS
                        )
                        cv2.putText(
                            frame,
                            f"{args.joint}: {angle:.0f} deg  reps: {counter.count}",
                            (10, 30),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.8,
                            (75, 88, 212),
                            2,
                        )

                if args.preview:
                    cv2.imshow("Rozakos rep counter", frame)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break

                # finalize the set after a quiet period
                if (
                    counter.count > 0
                    and last_rep_at is not None
                    and time.monotonic() - last_rep_at > args.idle_seconds
                ):
                    print(f"Set complete: {counter.count} reps @ {args.weight} kg")
                    await ws.send(
                        json.dumps(
                            {
                                "type": "set_complete",
                                "exercise_id": args.exercise_id,
                                "reps": counter.count,
                                "weight_kg": args.weight,
                            }
                        )
                    )
                    counter.reset()
                    last_rep_at = None

                await asyncio.sleep(0)  # yield to the websocket loop

    cap.release()
    if args.preview:
        cv2.destroyAllWindows()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MediaPipe camera rep counter")
    parser.add_argument("--server", default="http://127.0.0.1:8000")
    parser.add_argument("--api-key", required=True, help="Device API key (rzk_...)")
    parser.add_argument("--exercise-id", type=int, required=True)
    parser.add_argument("--weight", type=float, default=0.0, help="Weight in kg logged per set")
    parser.add_argument("--joint", choices=sorted(JOINTS), default="elbow_right")
    parser.add_argument("--angle-low", type=float, default=70.0)
    parser.add_argument("--angle-high", type=float, default=150.0)
    parser.add_argument("--idle-seconds", type=float, default=20.0)
    parser.add_argument("--camera", type=int, default=0, help="cv2 camera index")
    parser.add_argument("--preview", action="store_true", help="Show debug window (desktop only)")
    args = parser.parse_args()
    asyncio.run(run(args))
