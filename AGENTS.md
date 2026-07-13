# AGENTS.md — Rozakos Fitness

Guide for AI agents (and humans) picking up this project.

## What this is

A clone of the **Tracked • Strength Training** iOS app (strength core only — no
nutrition/AI/social/coaching in v1) plus a **device API** so embedded projects (Raspberry Pi
camera rep-counters) can log/stream sets into a live workout. Full plan and decisions:
see `README.md` and the approved plan at
`C:\Users\Rozakos1\.claude\plans\synthetic-whistling-sedgewick.md`.

**Note:** this repo lives under `Documents\Python_Projects` by accident — it is a
mobile + backend monorepo, not Python-only.

## Brand (from rozakos.com theme CSS)

Dark charcoal `#2c2c3e` (backgrounds), crimson `#a5211f` (primary actions), teal `#2fb1a2`
(success/PRs), alert `#dc5a5a`, light surface `#f4f4f4`. Aesthetic: dark, minimal, clean
sans-serif. All mobile theme tokens live in `mobile/src/theme/`.

## Layout

- `backend/` — FastAPI + SQLAlchemy 2.0 + SQLite (`create_all`, no migrations yet).
  - `app/models.py` — User, ApiKey, Exercise, Routine(+Exercise), Workout(+Exercise), WorkoutSet, BodyweightEntry
  - `app/routers/` — auth (JWT), exercises, routines, workouts, stats, bodyweight, devices
  - `app/live.py` — WebSocket hub `/ws/workout/{id}` (phone: `?token=JWT`, device: `?api_key=rzk_...`)
  - `app/seed.py` — ~60 built-in exercises, seeded on startup
  - `tests/` — pytest; run with `cd backend && python -m pytest tests -q`
- `mobile/` — Expo (React Native, TypeScript, expo-router). State: React Query (server) + zustand (active workout). Charts: react-native-gifted-charts.
- `examples/raspi_rep_counter.py` — simulated device client; `raspi_camera_mediapipe.py` — real CV one.
- `docs/api.md` — full REST + WebSocket reference; `docs/device-integration.md` — device build guide.
  **Keep both in sync with router/protocol changes.**

## Conventions & gotchas

- Backend auth: `get_current_user` (Bearer JWT) for the app, `get_device_user` (X-API-Key) for devices. API keys are SHA-256 hashed at rest; plaintext shown once at creation.
- Only **one active workout** per user (`finished_at IS NULL`); starting another returns 409. Devices target "the active workout" implicitly.
- Warm-up sets (`is_warmup`) are excluded from all stats/PRs. Volume = reps × weight_kg. Est-1RM = Epley `w*(1+reps/30)`.
- Finishing a workout drops exercises with zero logged sets (routine placeholders that were skipped).
- Endpoints that broadcast over WebSocket are `async def` (manual set log, device set log); the rest are sync.
- Settings via `pydantic-settings`, env prefix `ROZAKOS_` (see `backend/app/config.py`).
- Windows dev box; Node.js installed at `C:\Program Files\nodejs` (may need adding to PATH in fresh shells).

## Status (2026-07-13)

- [x] Backend: models, auth, exercises+seed, routines, workouts/sets/supersets, stats, bodyweight, device API keys, WebSocket live hub
- [x] Backend tests: 12 passing (`backend/tests/`)
- [x] Example device client (`examples/raspi_rep_counter.py`)
- [x] Mobile app: Expo SDK 57 (routes in `mobile/src/app/`), all screens built — auth, Home, active
  Workout (ghost values, rest timer, warmup/RPE, live WS badge), Routines + editor, Exercise library
  + detail (est-1RM chart, rep PRs), Profile (volume/muscle/bodyweight charts), Devices (API keys)
- [x] `tsc --noEmit` clean; `expo export --platform web` bundles all 19 routes
- [x] End-to-end verified against live server: full REST flow, device REST set logging, and live WS
  (example client streamed reps → phone-side socket received `rep` + `set_logged`); see
  `.claude/skills/verify/SKILL.md` for the recipe
- [x] v1.1 (2026-07-14): workout notes (`PATCH /workouts/{id}` + UI, verified live), kg/lb unit
  toggle (`mobile/src/store/settings.ts` — server always stores kg, conversion at display/input
  boundary), rest timer ±30s, real MediaPipe camera client (`examples/raspi_camera_mediapipe.py`,
  needs hardware to test)
- [x] Pushed to https://github.com/Rozakos/rozakos-fitness (repo-local git identity: Rozakos / billmewtwo1996@gmail.com)
- [x] v1.2 (2026-07-14): mid-workout swap/reorder UI, post-workout summary screen with PR badges
  (`workout-summary/[id]`), RPE-or-RIR setting (server stores RPE only; RIR = 10 − RPE at the UI
  boundary), double-progression hint (targets copied from routine onto WorkoutExercise —
  **schema change: delete stale dev fitness.db, create_all won't add columns**), plate calculator
- [ ] Not yet verified on a physical phone via Expo Go (no emulator on this box)
- [ ] MediaPipe client untested on real hardware (no camera here); angle thresholds need calibration

## Next steps when picking up

1. On-phone smoke test: `uvicorn app.main:app --host 0.0.0.0` + `npx expo start`, scan QR with Expo Go.
2. Test `examples/raspi_camera_mediapipe.py` on the Pi with a camera; calibrate --angle-low/high per movement.
3. Candidate v1.3 items: programs with phases/roadmaps, bodyweight-relative PRs, trend smoothing,
   HealthKit/Health Connect, import from Strong/Hevy CSV. Nutrition/AI/social remain deliberately out of scope.
4. Keep this Status section updated as work progresses.
