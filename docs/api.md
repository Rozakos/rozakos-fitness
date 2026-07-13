# Rozakos Fitness — API Reference

Base URL: `http://<host>:8000`. Interactive OpenAPI docs live at `/docs`.

Two authentication schemes:

| Scheme | Header | Who |
|---|---|---|
| JWT bearer | `Authorization: Bearer <token>` | The mobile app / humans |
| API key | `X-API-Key: rzk_...` | Embedded devices |

All weights are **kilograms** everywhere in the API; the app converts to lb at the UI only.
Warm-up sets (`is_warmup: true`) are excluded from every stats endpoint.

## Auth

| Method & path | Body | Returns |
|---|---|---|
| `POST /auth/register` | `{email, password (≥8), display_name}` | `201` `{access_token, token_type, user}` — `409` if email taken |
| `POST /auth/login` | `{email, password}` | `{access_token, token_type, user}` — `401` on bad credentials |
| `GET /auth/me` | — | current user |

Tokens expire after 7 days by default (`ROZAKOS_ACCESS_TOKEN_EXPIRE_MINUTES`).

## Exercises

| Method & path | Notes |
|---|---|
| `GET /exercises?search=&muscle_group=` | Built-ins (61 seeded) + your custom exercises |
| `POST /exercises` | `{name, muscle_group, equipment, rest_seconds_default}` → custom, visible only to you |
| `GET /exercises/{id}` | |
| `GET /exercises/{id}/history?limit=10` | Newest-first entries `{workout_id, date, sets[]}` from **finished** workouts — powers the "last time" ghost values |

## Routines (templates)

| Method & path | Notes |
|---|---|
| `GET /routines` / `POST /routines` | |
| `GET/PUT/DELETE /routines/{id}` | `PUT` replaces the whole exercise list |

Routine exercise shape: `{exercise_id, order, superset_group, target_sets, target_reps_min, target_reps_max}`.
Exercises sharing a `superset_group` number form a superset.

## Workouts

Only **one active workout** (`finished_at == null`) per user — starting a second returns `409`.

| Method & path | Notes |
|---|---|
| `POST /workouts` | `{routine_id?}` — copies the routine's exercises **including rep-range targets** onto the session |
| `GET /workouts?limit=&offset=` | Finished workouts, newest first |
| `GET /workouts/active` | Full active workout or `null` |
| `GET /workouts/{id}` | |
| `PATCH /workouts/{id}` | `{notes}` — explicit `null` clears, omitting the key leaves untouched |
| `POST /workouts/{id}/finish` | Drops exercises with zero logged sets; `409` if already finished |
| `DELETE /workouts/{id}` | |
| `POST /workouts/{id}/exercises` | `{exercise_id, superset_group?}` |
| `PATCH /workouts/{id}/exercises/{we_id}` | `{exercise_id?}` (swap movement), `{order?}`, `{superset_group?}` |
| `DELETE /workouts/{id}/exercises/{we_id}` | |
| `POST .../{we_id}/sets` | `{reps, weight_kg, rpe?, is_warmup?}` — `set_number` auto-increments; broadcast to the live channel |
| `PATCH .../sets/{set_id}` | Partial update |
| `DELETE .../sets/{set_id}` | |

The API stores intensity as **RPE (1–10)** only. The app's RIR mode converts at the
UI boundary (`RIR = 10 − RPE`).

## Stats & bodyweight

| Method & path | Returns |
|---|---|
| `GET /stats/prs` | Per exercise: best weight at each rep count (capped at 12) with the date it was set |
| `GET /stats/volume?weeks=12` | Per ISO week: `total_volume_kg` (Σ reps × weight) + `by_muscle_group` |
| `GET /stats/exercise/{id}` | Per finished workout: `best_est_1rm` (Epley: `w × (1 + reps/30)`), `top_weight_kg`, `total_volume_kg` |
| `GET /bodyweight?limit=90` | Newest first |
| `POST /bodyweight` | `{date, weight_kg}` — one entry per day, same-day upserts |
| `DELETE /bodyweight/{id}` | |

## Devices

| Method & path | Auth | Notes |
|---|---|---|
| `GET /devices` | JWT | Key hashes only — never the plaintext |
| `POST /devices` | JWT | `{name}` → the `rzk_...` key is in the response **once**; store it on the device |
| `DELETE /devices/{id}` | JWT | Revokes immediately |
| `GET /device/active-workout` | API key | `{active, workout_id}` — poll this to discover a session |
| `POST /device/sets` | API key | `{exercise_id, reps, weight_kg?, rpe?, is_warmup?}` → logs into the active workout (`409` if none), auto-adding the exercise to the session if needed. `source` is set to `"device"` |

Keys are SHA-256 hashed at rest; `last_used_at` updates on every authenticated call.

## WebSocket: live workout channel

```
ws://<host>:8000/ws/workout/{workout_id}?token=<JWT>        # phone
ws://<host>:8000/ws/workout/{workout_id}?api_key=<rzk_...>  # device
```

One room per workout; everyone in the room receives every broadcast. Bad credentials or a
workout that isn't yours **fail the handshake with HTTP 403**.

Messages a **device** may send:

| Message | Effect |
|---|---|
| `{"type": "rep", "exercise_id": 1, "count": 3}` | Broadcast as-is (transient — nothing persisted); the app shows a live rep badge |
| `{"type": "set_complete", "exercise_id": 1, "reps": 8, "weight_kg": 60, "rpe": 8, "is_warmup": false}` | Persisted like `POST /device/sets`, then broadcast as `set_logged` |
| `{"type": "ping"}` | Answered with `{"type": "pong"}` (any client) |

Messages the server broadcasts:

| Message | When |
|---|---|
| `{"type": "rep", "exercise_id", "count"}` | Device rep event |
| `{"type": "set_logged", "workout_exercise_id", "exercise_id", "set": {…}}` | Any set persisted — manual (REST) or device (REST/WS) |
| `{"type": "error", "detail"}` | Sent only to a device whose `set_complete` failed (e.g. workout finished meanwhile) |
