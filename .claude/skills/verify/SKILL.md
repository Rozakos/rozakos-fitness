# Verify: Rozakos Fitness

How to exercise this repo end-to-end (learned 2026-07-13).

## Backend (FastAPI)

```powershell
cd backend
Remove-Item fitness.db -ErrorAction SilentlyContinue   # fresh DB, auto-seeded on startup
python -m uvicorn app.main:app --port 8000             # run in background
```

Drive the REST surface with curl (JSON auth, no forms):

1. `POST /auth/register {"email","password","display_name"}` → 201 + `access_token`
2. `GET /exercises` with `Authorization: Bearer <token>` → 61 seeded exercises
3. `POST /routines`, `POST /workouts {"routine_id"}`, `POST /workouts/{id}/exercises/{we_id}/sets`
4. Devices: `POST /devices {"name"}` → key shown once; device calls use `X-API-Key` header
5. `POST /workouts/{id}/finish`, then `/stats/prs`, `/stats/volume`, `/stats/exercise/{id}`

## Live WebSocket flow (the flagship feature)

- Needs `pip install requests websockets` (not in backend/requirements.txt — device-side deps).
- Phone side: connect `ws://127.0.0.1:8000/ws/workout/{id}?token=<JWT>` and read broadcasts.
- Device side: run the real example client:
  `python examples/raspi_rep_counter.py --server http://127.0.0.1:8000 --api-key rzk_... --exercise-id 1 --weight 85 --sets 1`
  (~30s: streams `rep` events, then `set_complete` which persists with `source: "device"`).
- Expect phone to receive every `rep` plus one `set_logged`.

## Mobile (Expo)

- `cd mobile; npx tsc --noEmit` then `npx expo export --platform web` — bundles all 19 routes.
- True UI verification needs Expo Go on a phone (`npx expo start`); no emulator on this box.
- API base URL auto-derives from Metro's hostUri (see `src/api/config.ts`).

## Gotchas

- PowerShell tool cwd persists between calls — ALWAYS use absolute paths (`backend/mobile` mixups happened twice).
- Windows Python can't read Git Bash `/tmp` paths; pipe JSON via stdin instead of temp files.
- Unauthorized WS connects are rejected with HTTP 403 at handshake (starlette closes before accept).
- Delete `backend/fitness.db` + `backend/test_fitness.db` after verification runs.
