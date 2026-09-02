# Google Play readiness

This is the repository-side and Play Console checklist for `com.rozakos.fitness`. Recheck
the linked policies before each public release because target levels and declarations change.

## Build facts

- Android App Bundle: produced by `scripts/release.ps1`; upload the `.aab`, not the APK.
- Play App Signing: enabled when the app is created; the local key is the upload key.
- Current target: Android 16 / API 36. The release script regenerates native Android files
  from `mobile/app.json` before each build.
- Minimum Android: API 24.
- Architectures: the release bundle contains 64-bit ARM (`arm64-v8a`).
- Android backup is disabled because local mode and the account's offline-read cache can hold
  sensitive fitness data.
- The manifest requests only network access/state. Legacy storage, overlay, vibration, and
  unused biometric permissions contributed by dependencies are explicitly removed.

## Public and in-app disclosures

- Privacy Policy: `https://fitness-api.rozakos.eu/privacy`
- Account deletion: `https://fitness-api.rozakos.eu/account-deletion`
- In-app deletion: Profile -> Account -> Delete account and data
- In-app privacy link: registration and Profile -> Privacy & support
- Support email: `billmewtwo1996@gmail.com`
- Play icon: `mobile/assets/store/icon.png` (1024 x 1024)
- Feature graphic: `mobile/assets/store/feature-graphic.png` (1024 x 500)

Both, and every launcher/splash/favicon variant beside them, are **generated** by
`python scripts/make-logo.py` — do not hand-edit the PNGs, they are overwritten on the next
run. `node scripts/check-play-readiness.mjs` asserts the two Play dimensions above.
See [docs/branding.md](branding.md). Play caches listing artwork separately from the bundle,
so a brand change means re-uploading the icon and feature graphic in the Console as well as
shipping a new build.

Both public pages must continue to load without login, geography restrictions, or a PDF
viewer. Account deletion removes all owned live data. Rotating disaster-recovery backups
expire within 30 days.

## App content answers

- Category: **Health & Fitness**.
- Ads: **No**.
- Target audience: **18 and over** unless the product is deliberately changed for minors.
- Medical functionality: **No**. It logs strength training and progress and makes no medical
  diagnosis, treatment, or monitoring claims.
- Health apps declaration: **Fitness and activity**. The app does not request Health Connect,
  body sensor, activity recognition, location, camera, or medical-device permissions.
- Account creation: **Yes**. Declare both the in-app deletion path and public deletion URL.
- App access for review: provide a working review account, or explain that reviewers can choose
  **Use without an account**. A review account is still preferable because it exercises sync.

## Data safety form

Answer **Yes** to data collection and **No** to sharing. Cloudflare and the transactional
email sender are service providers processing data on the developer's behalf, not
advertising/data-sharing integrations. Data is encrypted in transit, deletion can be
requested, and the app has no ads or analytics.

Declare these collected categories for account mode:

| Play data type | What the app handles | Purpose |
|---|---|---|
| Personal info -> Name | Display name | App functionality, account management |
| Personal info -> Email address | Login, confirmation, recovery | App functionality, account management |
| Personal info -> User IDs | Internal account identifier | App functionality, account management |
| Health and fitness -> Fitness info | Workouts, exercises, sets, reps, load, RPE/RIR, routines and progress | App functionality |
| Health and fitness -> Health info | Bodyweight entries | App functionality |
| App activity -> Other user-generated content | Workout notes, custom exercise names, setup rows and form-video links | App functionality |
| Device or other IDs | IP/network identifiers in security and request logs | Security, fraud prevention, app functionality |
| App activity -> App interactions | Requested API paths and response status in operational logs | App functionality, service operations |

Collection is optional at the app level because **Use without an account** keeps data on the
device. Do not mark any category as used for advertising, marketing, personalization, or sale.
If a future release adds crash reporting, analytics, Health Connect, camera rep counting,
notifications, or another SDK, reassess the form before uploading it.

## Store and release checklist

1. Complete developer identity/contact verification in Play Console.
2. Create the app with the permanent package name `com.rozakos.fitness` and enroll in Play App
   Signing.
3. Add title, short/full descriptions, phone screenshots, 512 px icon, 1024 x 500 feature
   graphic, category, and support contact. Ready-to-paste copy and the screenshot order are in
   `docs/store-listing.md`.
4. Complete Privacy Policy, Data safety, Health apps, Ads, Target audience, Content rating,
   App access, and Account deletion declarations with the answers above.
5. Keep the verified Resend sender healthy: monitor delivery, verify SPF/DKIM/DMARC for
   `fitness.rozakos.eu`, and re-test confirmation, resend, and reset links after credential or
   DNS changes.
6. Run `scripts/release.ps1 -Version X.Y.Z`, manually upload the first AAB to Internal testing,
   and let Play run pre-launch reports.
7. Satisfy any closed-testing requirement shown for the developer account, then promote through
   closed/open testing or production. These eligibility requirements vary by account history.
8. Resolve every policy or device-catalog warning before production rollout.

Official references:

- Target API levels: <https://developer.android.com/google/play/requirements/target-sdk>
- Data safety: <https://support.google.com/googleplay/android-developer/answer/10787469>
- Account deletion: <https://support.google.com/googleplay/android-developer/answer/13327111>
- Health content and services: <https://support.google.com/googleplay/android-developer/answer/16679511>
