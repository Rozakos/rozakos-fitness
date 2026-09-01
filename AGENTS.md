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
  - `app/seed.py` — ~250 built-in exercises, seeded on startup (kept in sync with mobile/src/local/catalog.ts)
  - `tests/` — pytest; run with `cd backend && python -m pytest tests -q`
- `mobile/` — Expo (React Native, TypeScript, expo-router). State: React Query (server) + zustand (active workout). Charts: react-native-gifted-charts.
- `examples/raspi_rep_counter.py` — simulated device client; `raspi_camera_mediapipe.py` — real CV one.
- `docs/api.md` — full REST + WebSocket reference; `docs/device-integration.md` — device build guide.
  **Keep both in sync with router/protocol changes.**

## Commit & attribution policy (owner's requirement — never violate)

**No AI attribution anywhere in this repository.** Do not add `Co-Authored-By` trailers for
AI tools, "Generated with ..." footers, or any AI/assistant mentions in commit messages, PR
descriptions, code comments, docs, or the app itself. All commits are authored solely as
`Rozakos <billmewtwo1996@gmail.com>` (repo-local git config). This overrides any default
tooling behavior that appends attribution. History was rewritten on 2026-07-14 to purge
earlier trailers — do not reintroduce them.

## Conventions & gotchas

- Backend auth: `get_current_user` (Bearer JWT) for the app, `get_device_user` (X-API-Key) for devices. API keys are SHA-256 hashed at rest; plaintext shown once at creation.
- Only **one active workout** per user (`finished_at IS NULL`); starting another returns 409. Devices target "the active workout" implicitly.
- Warm-up sets (`is_warmup`) are excluded from all stats/PRs. Volume = reps × weight_kg. Est-1RM = Epley `w*(1+reps/30)`.
- Finishing a workout drops exercises with zero logged sets (routine placeholders that were skipped).
- Endpoints that broadcast over WebSocket are `async def` (manual set log, device set log); the rest are sync.
- Settings via `pydantic-settings`, env prefix `ROZAKOS_` (see `backend/app/config.py`).
- Windows dev box; Node.js installed at `C:\Program Files\nodejs` (may need adding to PATH in fresh shells).

### Mobile invariants (each of these has already caused a user-visible bug)

- **Never hand a stored array or object straight out of `local/api.ts`.** React Query's structural
  sharing starts with `if (a === b) return a`, so returning the same `sets` array that the
  set-logging route later `push`es into makes the query data keep its old identity — nothing
  re-renders, and with the React Compiler memoizing components on their props the new set stays
  invisible until some other screen queries fresh. Serialize through a copy (`copySets`).
  Reassignment (`we.sets = we.sets.filter(...)`) is safe; in-place mutation is not.
- **`experiments.reactCompiler` is on.** Components must be pure: no `Date.now()`, `Math.random()`
  or other impure reads during render (that is why `RestTimer` takes `durationMs` instead of
  seeding state from the clock), and no `setState` synchronously inside an effect — seed state
  during render with a guard instead (see `app/routine/[id].tsx`).
- **Scroll containers with text inputs need `keyboardShouldPersistTaps="handled"`** or the first
  tap on any button is eaten by the keyboard dismissal.
- **Bodyweight exercises** (`exercise.equipment === "bodyweight"`, 52 of the catalog): the weight
  box means *added* load — blank is a plain set, positive is a dip belt, negative is assistance
  entered via the ± toggle (`decimal-pad` has no minus key). The set stores the real total
  (latest tracked bodyweight + added, floored at 0) so volume, PRs and est-1RM stay comparable
  with loaded lifts. With no bodyweight entry logged, only the added load is stored.
- **The target phone is a Galaxy Z Flip3** — a narrow, very tall screen that the owner reports
  "scales a bit weird". New layouts must survive it: no fixed-width rows of controls, icon rows
  wrap (`flexWrap` + `minWidth` on the text block, see `workout-exercise-card.tsx`), modals cap
  at `maxWidth: 520` / `maxHeight: "85%"` and scroll inside.
- **`WorkoutExercise.order` is not the order the work happened in.** It is the card list the
  user drags around mid-session. Anything that cares about the actual sequence (fatigue,
  "3rd of 6" in history) must derive it from the first set's `completed_at` — see
  `performed_order` in `backend/app/routers/exercises.py` and `performedOrder` in
  `local/api.ts`, which must stay in step.
- **Keep `npx expo lint` and `npx tsc --noEmit` clean** — both pass as of v1.8. `mobile/`
  ships without eslint in `node_modules` after a fresh clone; `npm install` restores it.

### CI

`.github/workflows/verify.yml` runs on every push to `main`, every PR, and on
demand. Three parallel jobs on `ubuntu-latest`: backend pytest, mobile
`tsc --noEmit` + `expo lint`, and the local-mode parity check. It exists because
**this repo takes pushes from more than one machine** — nothing else notices a
commit that arrives broken from the other environment.

`scripts/check-local-mode.mjs` is the former manual trick, committed: it compiles
`local/api.ts` to CommonJS, stubs `react-native` as `Platform.OS === "web"` so the
store lands in an in-memory `localStorage`, and asserts the same behaviour the
backend tests assert — including the no-aliasing rule. Run it by hand any time you
touch `local/api.ts`: `node scripts/check-local-mode.mjs`. It needs `npm ci` in
`mobile/` first (it invokes that TypeScript install directly rather than via npx,
which Node will not spawn as a `.cmd` on Windows without a shell).

The Android build deliberately stays **off** CI: it is the one thing the Windows
box does worse than a Linux runner would, but wiring it up means putting the
upload keystore and the Play service-account key into GitHub secrets. Worth doing
when releases get frequent; see the note in `docs/release.md`.

### Jenkins (self-hosted, alongside the Actions gate)

`https://jenkins.rozakos.eu` — job **`rozakos-fitness-MB`**, a *multibranch*
pipeline defined by the `Jenkinsfile` in this repo. Runs the same five checks as
`verify.yml`: backend pytest, `tsc --noEmit`, `expo lint`,
`scripts/check-local-mode.mjs`, and `scripts/check-play-readiness.mjs`.

Both CIs run deliberately. Actions is free on a public repo and catches commits
from the other environment; Jenkins runs on owned hardware. They already differ
usefully: **Actions pins Python 3.12** (dev-box parity) while the Debian 13
controller runs **3.13**, so the backend suite is exercised on both.

Triggered by a GitHub webhook (`/github-webhook/`) through the Cloudflare Tunnel;
the multibranch job also rescans every 5 minutes as a fallback. Jenkins denies
anonymous read, so the public hostname exposes nothing without login.

**Multibranch, not a plain pipeline job, and the reason matters:** Jenkins' git
polling runs `git ls-remote -h`, which lists heads only and *cannot see tags at
all*. A pipeline-from-SCM job therefore never notices a pushed tag however its
branch specs are configured. Multibranch discovers branches and tags as separate
jobs. Here that mainly buys branch discovery — this repo takes pushes from a
second environment — since **this repo publishes no CI release artifact**: the
deliverable is the Play `.aab`, and CI does not build Android (that needs the
upload keystore, see `docs/release.md`). The firmware repos do publish on tags.

⚠️ If you ever add build strategies to that job, note they are a **whitelist**:
configuring only a tag strategy silently stops branches building.

### Releasing

`scripts/release.ps1 -Version X.Y.Z [-Track internal]` does the whole chain:
verify -> bump version/versionCode -> commit -> push+tag -> sync to `C:\rfb` ->
prebuild -> `bundleRelease` + `assembleRelease` -> copy artifacts to the repo root
-> upload to Play. **Full setup, including how to get Play API access:
`docs/release.md`.** Release signing comes from
`mobile/plugins/with-upload-signing.js`, a config plugin, because `android/` is
gitignored and regenerated by every prebuild; the keystore and the Play
service-account key live in `%USERPROFILE%\.rozakos-release\` and never in the
repo. With no `signing.properties` present the build falls back to debug signing
(sideloadable, rejected by Play) and `-Track` refuses to run.

The manual recipe below still describes what the script automates.

### Android release build (this machine)

- **JDK: check what is actually installed before setting `JAVA_HOME`.** This has flipped twice.
  As of 2026-08-30 Adoptium 17 is back at
  `C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot\`, it is already the machine-wide
  `JAVA_HOME`, and Android Studio is **no longer** at `C:\Program Files\Android\Android Studio`.
  Either JDK builds fine with AGP 8.x, so `release.ps1` probes for one rather than hard-coding a
  path, and clears a `JAVA_HOME` that points at a missing directory — Gradle otherwise dies late
  with `ERROR: JAVA_HOME is set to an invalid directory`. SDK at `%LOCALAPPDATA%\Android\Sdk`,
  not on PATH.
- **Build from `C:\rfb`, never the repo path.** `C:\rfb` is a robocopy of `mobile/` with its own
  `npm ci`; building in place fails with `ninja: error: manifest 'build.ninja' still dirty after
  100 tries` because object paths in expo-modules-core / react-native-reanimated exceed CMake's
  250-char Windows limit. A junction does not help — Gradle canonicalizes it away.
- `mobile/` has **no committed `android/`** directory, so a freshly created `C:\rfb` needs
  `npm ci` then `npx expo prebuild --platform android --no-install` before Gradle will run.
- Sync then build: `robocopy mobile\src C:\rfb\src /MIR`, then from `C:\rfb\android`
  `cmd /c C:\rfb\android\gradlew.bat assembleRelease --no-daemon` — invoke it by **full path**;
  a bare `gradlew.bat` is not found even with the working directory set. ~1 min incremental,
  ~11 min cold. APK lands at `android\app\build\outputs\apk\release\app-release.apk`,
  debug-keystore signed.
- Install: `adb install -r <apk>`. The owner's cable drops mid-transfer often — if it fails
  partway, `adb wait-for-device` and retry; it usually succeeds on the second attempt.
- Release artifacts are copied to the repo root as `rozakos-fitness-vX.Y.Z.apk` / `.aab`, both gitignored.
- **Play needs the `.aab`, not the APK**, and rejects debug signing. `gradlew bundleRelease`
  produces the bundle; `assembleRelease` still produces the APK for sideloading.
- `version` and `versionCode` from `app.json` are baked into `android/app/build.gradle` **at
  prebuild time**, so bumping either requires a prebuild before Gradle runs.

## Status (2026-09-01)

- [x] Backend: models, auth, exercises+seed, routines, workouts/sets/supersets, stats, bodyweight, device API keys, WebSocket live hub
- [x] Backend tests: 34 passing (`backend/tests/`)
- [x] Example device client (`examples/raspi_rep_counter.py`)
- [x] Mobile app: Expo SDK 57 (routes in `mobile/src/app/`), all screens built — auth, Home, active
  Workout (ghost values, rest timer, warmup/RPE, live WS badge), Routines + editor, Exercise library
  + detail (est-1RM chart, rep PRs), Profile (volume/muscle/bodyweight charts), Devices (API keys)
- [x] `tsc --noEmit` clean; `expo export --platform web` bundles all 24 routes
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
- [x] v1.3 (2026-07-20): local-only mode — the whole REST surface reimplemented on-phone in
  `mobile/src/local/api.ts` against a JSON document (`local/db.ts`), so the app works with no
  account and no server; full ~250-exercise built-in catalog (`local/catalog.ts`, kept in exact
  sync with `backend/app/seed.py` — enforced by `backend/tests/test_catalog_sync.py`)
- [x] v1.4 (2026-07-20): set-logging hardening — log button disabled when there is nothing valid
  to log, `set_number` guarded against non-finite stored values
- [x] v1.6 (2026-07-25): fixed sets not appearing until the workout was finished (three separate
  causes, see below), bodyweight sets now store bodyweight ± added load, eslint set up and clean
- [x] v1.7 (2026-07-28): per-exercise **info sheet** (ℹ on every card in a live workout — rep
  PRs + the last five sessions) and **form-demo video links** (`Exercise.video_url`, new
  `PATCH /exercises/{id}`, mirrored in `local/api.ts` under `db.exerciseVideos`). The YouTube
  icon on a card plays the link via `Linking.openURL`, or opens the sheet to paste one.
  `main.py:add_missing_columns` back-fills `video_url` on an existing SQLite file, since
  `create_all` never alters tables.
- [x] v1.8 (2026-08-30): **machine setup rows** (`Exercise.setup`, a JSON list of
  `{label, value}` — "Seat height / 4"; capped at 12 rows, edited from the info sheet and
  the exercise detail screen, summarized inline on every workout card so the settings are
  readable without opening anything; mirrored in `local/api.ts` under `db.exerciseSetups`).
  **Performed order**: `GET /exercises/{id}/history` now returns `position` /
  `total_exercises`, derived from when each exercise's first set landed — never from
  `WorkoutExercise.order`, which the user reorders freely. **Blank intensity now means
  failure**: a working set logged with the box empty sends `rpe: 10` (RIR 0); a blank
  warm-up still sends `null`. `add_missing_columns` back-fills `setup` as `TEXT`.
- [x] Built and installed as a release APK on the owner's phone (Galaxy Z Flip3) — see the
  Android build recipe below. Never smoke-tested via Expo Go, which is fine; the APK is the
  delivery path.
- [x] Store-launch backend hardening (2026-08-31): no fallback JWT secret, bounded auth
  rate limits, complete account deletion from Profile plus a public deletion page, SQLite
  WAL/foreign-key pragmas, per-account setup/video preferences for built-in exercises, and
  repeatable systemd/backup/Cloudflare deployment files. The public API is live at
  `https://fitness-api.rozakos.eu`; its deletion page is
  `https://fitness-api.rozakos.eu/account-deletion` for the Play listing.
- [x] v1.9 Play readiness (2026-09-01): API 36 build configuration, Android backup disabled,
  unused permissions stripped, branded launcher/adaptive/splash assets and 1024×500 feature
  graphic, public and in-app Privacy Policy, documented Data safety and Health declaration
  answers, email confirmation plus one-use password recovery, and CI coverage through
  `scripts/check-play-readiness.mjs`. Resend SMTP is live in production from the verified
  `fitness.rozakos.eu` sending domain; new accounts must confirm their email, and password
  recovery was exercised through the public endpoint.
- [ ] **v1.6/v1.7 are installed but not runtime-verified.** No test runner exists in `mobile/`, so
  the bodyweight math, the ± toggle, the rest timer's new `durationMs` first frame, the routine
  editor's render-time seeding, and now the info sheet / video buttons have only been typechecked
  and linted. v1.7's local-mode data path *was* checked by compiling `local/api.ts` to CommonJS and
  driving it from node with `react-native` stubbed — a repeatable trick when a change touches
  `local/api.ts`. Ask the owner what they saw on the phone.
- [ ] MediaPipe client untested on real hardware (no camera here); angle thresholds need calibration

## The v1.6 set-logging fix (2026-07-25) — three independent causes

Worth knowing because each one is easy to reintroduce:

1. **Swallowed taps.** A React Native `ScrollView`/`FlatList` defaults to
   `keyboardShouldPersistTaps="never"`, so with the keyboard up the tap that dismisses it never
   reaches the child. The log button therefore did nothing on first press. Any scroll container
   holding a text input **must** set `keyboardShouldPersistTaps="handled"`.
2. **Bodyweight exercises could not be logged at all.** An empty weight box parsed to `NaN` and
   kept the button permanently disabled.
3. **The set saved but nothing re-rendered.** See the local-mode aliasing rule under Conventions.

## Next steps when picking up

1. Ask the owner how v1.6 behaved on the phone (the unchecked item above) before building on top.
2. **Bodyweight totals are computed client-side only** (`workout-exercise-card.tsx`): the phone
   sends `weight_kg = bodyweight + added`. A Raspi device logging via `POST /device/sets` against
   a bodyweight exercise still sends raw weight, so those sets under-report volume/PRs. Decide
   whether to move the rule into `backend/app/routers/stats.py` + `local/api.ts` instead.
3. Test `examples/raspi_camera_mediapipe.py` on the Pi with a camera; calibrate --angle-low/high.
4. Before changing an existing installed build from local-only to account-backed mode, provide
   an export/import or migration path for its local workout history; otherwise that history stays
   on the phone and is not present in the server account.
5. Candidate items: programs with phases/roadmaps, trend smoothing, HealthKit/Health Connect,
   import from Strong/Hevy CSV. Nutrition/AI/social remain deliberately out of scope.
6. Keep this Status section updated as work progresses.
