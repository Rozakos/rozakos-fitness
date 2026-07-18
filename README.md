# Rozakos Fitness

A workout-tracking app in the spirit of **Tracked / Strong / Hevy**, with a twist: a
first-class device API so embedded projects (e.g. a Raspberry Pi with a camera) can count
your reps and stream them live into your workout.

Built to match the [rozakos.com](https://rozakos.com) brand: dark charcoal (`#2c2c3e`),
crimson accent (`#a5211f`), teal for PRs (`#2fb1a2`). *Build your ideas* — then lift them.

## What's inside

| Part | Stack | Path |
|---|---|---|
| API server | Python, FastAPI, SQLAlchemy, SQLite | `backend/` |
| Mobile app | React Native, Expo, TypeScript | `mobile/` |
| Device examples | Python (requests + websockets) | `examples/` |
| Docs | [API reference](docs/api.md) · [Device integration guide](docs/device-integration.md) | `docs/` |

### Features (v1 — the Tracked strength-training core)

- Workout logging: weight, reps, RPE or RIR, warm-up sets, supersets, swap/reorder mid-session,
  session notes, kg/lb unit toggle, plate calculator
- Routines/templates with target sets × rep ranges, double-progression hints in-session
- Post-workout summary with duration, volume, and PR badges
- Exercise library (~250 seeded) + custom exercises, with per-exercise history
  ("last time" ghost values on every set row)
- Progress: per-rep-count PRs, estimated-1RM trend (Epley), weekly volume per muscle group
- Bodyweight tracking with trend
- Rest timer with per-exercise defaults
- **Local-only mode**: skip sign-up entirely — everything is stored on the phone
  (no account, no sync, no device API; the full built-in exercise catalog is bundled)
- **Device API**: per-user API keys; devices log sets over REST or stream live reps over
  WebSocket into the active workout

## Quick start

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --reload
```

- Interactive API docs: http://localhost:8000/docs (full reference: [docs/api.md](docs/api.md))
- The database (`fitness.db`) is created and seeded with exercises on first start. After
  pulling a schema change, delete the file — it's dev-only and there are no migrations yet.
- Configuration: copy `backend/.env.example` to `backend/.env` (all optional in dev).
- Run tests: `pytest`

### Mobile app

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with **Expo Go** on your phone. The app auto-derives the API URL from the
Metro dev server's LAN IP, so if the phone can load the app it can reach the backend — just
run uvicorn with `--host 0.0.0.0`. To point elsewhere, set `EXPO_PUBLIC_API_URL`
(see `mobile/src/api/config.ts`).

### Try the device flow (no hardware needed)

1. In the app: **Profile → Devices → Add device** — copy the `rzk_...` key (shown once).
2. Start a workout on your phone.
3. Run the simulated Raspi rep counter:

```bash
pip install requests websockets
python examples/raspi_rep_counter.py --server http://<your-lan-ip>:8000 --api-key rzk_... --exercise-id 1 --weight 60
```

Watch reps tick live on the workout screen; completed sets are logged with a device badge.

Got a camera? `examples/raspi_camera_mediapipe.py` is the real thing — MediaPipe pose tracking
counts reps from joint angles (elbow, knee, hip) and finalizes the set after an idle period:

```bash
pip install mediapipe opencv-python requests websockets
python examples/raspi_camera_mediapipe.py --server http://<ip>:8000 --api-key rzk_... \
    --exercise-id 28 --weight 12.5 --joint elbow_right --preview
```

## Device API in 30 seconds

```
POST /devices                      (JWT)      -> create API key, plaintext returned once
GET  /device/active-workout        (X-API-Key) -> {"active": true, "workout_id": 7}
POST /device/sets                  (X-API-Key) -> log a completed set into the active workout
WS   /ws/workout/{id}?api_key=...              -> stream {"type":"rep",...} and
                                                  {"type":"set_complete",...} events
```

`set_complete` messages are persisted server-side and broadcast to the phone as
`set_logged` — no polling needed. Full message spec and a step-by-step build guide:
[docs/device-integration.md](docs/device-integration.md).

## Configuration

Backend settings via environment variables (prefix `ROZAKOS_`) or `backend/.env`:

| Variable | Default | Notes |
|---|---|---|
| `ROZAKOS_DATABASE_URL` | `sqlite:///./fitness.db` | Any SQLAlchemy URL; Postgres is a drop-in |
| `ROZAKOS_SECRET_KEY` | dev value | **Change in production** |
| `ROZAKOS_ACCESS_TOKEN_EXPIRE_MINUTES` | 10080 (7 days) | |
