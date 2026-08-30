# Releasing Rozakos Fitness

```powershell
# build + push, no upload (the default)
.\scripts\release.ps1 -Version 1.9.0

# same, then publish to a Play track
.\scripts\release.ps1 -Version 1.9.0 -Track internal
```

`scripts/release.ps1` chains what used to be done by hand:

| Step | What it does | Fails the run if |
|---|---|---|
| Environment | Probes for a JDK (Adoptium, then the Android Studio JBR) and `%LOCALAPPDATA%\Android\Sdk` when `JAVA_HOME` / `ANDROID_HOME` are unset — or when `JAVA_HOME` points somewhere that no longer exists, which Gradle otherwise reports only after a long wait | No JDK or SDK is findable |
| Fetch | `git fetch` and refuses a stale base — a second environment also pushes to `origin/main` | Local `main` is behind |
| Verify | `pytest`, `tsc --noEmit`, `expo lint` | Any of the three fails |
| Bump | Sets `expo.version`, increments `expo.android.versionCode` in `mobile/app.json` | — |
| Commit & push | Commits the bump, tags `vX.Y.Z`, pushes both | Push rejected |
| Sync | Mirrors `src/`, `plugins/`, `assets/`, `app.json`, `package.json` into `C:\rfb` | `C:\rfb` missing |
| Prebuild | Regenerates `android/` — version, versionCode **and** the signing config are all baked in at prebuild time, so a version bump requires it | Prebuild fails, or the signing plugin did not apply |
| Build | `bundleRelease` (.aab for Play) then `assembleRelease` (.apk for sideloading) | Gradle fails or an artifact is missing |
| Upload | Opens a Play edit, uploads the .aab, sets the track, commits | Any API error (the edit is rolled back) |

Artifacts land at the repo root as `rozakos-fitness-vX.Y.Z.aab` / `.apk`, both gitignored.

Useful switches: `-SkipVerify` (re-run a build you already verified), `-NoPush`,
`-NoPrebuild` (only safe when neither the version nor `app.json` changed),
`-BuildDir` (defaults to `C:\rfb`).

## Why `C:\rfb`

Building inside the repo path fails with `ninja: error: manifest 'build.ninja'
still dirty after 100 tries`: object paths in expo-modules-core and
react-native-reanimated exceed CMake's 250-character limit on Windows. A junction
does not help — Gradle canonicalizes it away. `C:\rfb` is a copy of `mobile/`
with its own `npm ci`. See AGENTS.md.

## One-time setup

Nothing below is in the repo. All of it lives in `%USERPROFILE%\.rozakos-release\`.

### 1. Signing key

**Reusing the keystore from your other published app is fine.** New apps are
required to use Play App Signing, which means what you upload with is only an
*upload key* — Google holds the actual app signing key, and an upload key can be
reset from the Console if it ever leaks. That is a much smaller commitment than
the old model, where losing the keystore meant losing the app.

The tidier arrangement is to reuse the same **keystore file** but add a **new key
alias** for this app, so a per-app key rotation never touches the other app:

```powershell
keytool -genkeypair -v -keystore <path-to-your-existing.jks> `
  -alias rozakos-fitness-upload -keyalg RSA -keysize 2048 -validity 10000
```

Sharing the existing alias across both apps also works, if you prefer one key.

Then write `%USERPROFILE%\.rozakos-release\signing.properties`:

```properties
storeFile=C:\\path\\to\\your.jks
storePassword=...
keyAlias=rozakos-fitness-upload
keyPassword=...
```

Back the keystore up somewhere off this machine. Without `signing.properties` the
script still builds, but debug-signed — fine for `adb install`, rejected by Play,
and `-Track` refuses to run.

### 2. Create the app in Play Console

The API cannot create a listing. In Play Console: **All apps → Create app**, with
package name `com.rozakos.fitness` (it is set in `mobile/app.json` and cannot be
changed after the first upload).

### 3. Give the release script API access

1. **Play Console → Settings → API access.** Link a Google Cloud project (create
   one if you have none) and accept the terms.
2. **In that Cloud project, enable the "Google Play Android Developer API"**
   (Cloud Console → APIs & Services → Library).
3. **Cloud Console → IAM & Admin → Service Accounts → Create service account.**
   Name it something like `play-publisher`. No project roles are needed — the
   permissions come from Play, not from Cloud IAM.
4. On that service account: **Keys → Add key → Create new key → JSON.** Save the
   download as `%USERPROFILE%\.rozakos-release\play-service-account.json`.
   Treat it like a password; anyone holding it can publish as you.
5. **Play Console → Users and permissions → Invite new user.** Paste the service
   account's email (it ends in `.iam.gserviceaccount.com`), scope it to
   Rozakos Fitness only, and grant **Release manager** — or, more narrowly,
   *Release to testing tracks* plus *Release to production* if you want it
   limited to publishing.

Permission changes can take a few minutes to propagate; a fresh service account
that 403s is usually just not ready yet.

### 4. Ship the first release by hand

An app with no prior release rejects an API upload. Build the artifact and upload
that one through the Console:

```powershell
.\scripts\release.ps1 -Version 1.8.0
```

Then in Play Console: **Testing → Internal testing → Create new release**, upload
`rozakos-fitness-v1.8.0.aab`, and roll it out. You will also have to clear the
one-time listing chores Play requires before anything can go out — store listing
copy, icon and feature graphic, content rating questionnaire, data safety form,
target audience, and a privacy policy URL.

Every release after that can go through `-Track internal`.

## Notes

- `versionCode` must increase on every upload and can never be reused, even for a
  deleted release. The script increments it and commits the change, so never edit
  it by hand.
- The uploader publishes with `status: "completed"` — the release goes out at
  100% on the chosen track. For a staged rollout, upload to `internal` and
  promote from the Console.
- If an upload fails midway, the Play edit is deleted and nothing is published.
