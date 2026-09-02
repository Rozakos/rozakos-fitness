from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from sqlalchemy import inspect, text

from . import live
from .config import get_settings
from .database import Base, SessionLocal, engine
from .rate_limit import auth_rate_limiter
from .routers import auth, bodyweight, devices, exercises, routines, stats, sync, workouts
from .seed import seed_exercises

settings = get_settings()

# Columns added after a table shipped. `create_all` only creates missing tables,
# so without this an existing fitness.db would 500 on every exercise read.
ADDED_COLUMNS: dict[str, dict[str, str]] = {
    "exercises": {"video_url": "VARCHAR(500)", "setup": "TEXT"},
    "users": {"email_verified_at": "DATETIME", "auth_version": "INTEGER NOT NULL DEFAULT 0"},
}


def add_missing_columns() -> None:
    inspector = inspect(engine)
    for table, columns in ADDED_COLUMNS.items():
        if not inspector.has_table(table):
            continue
        existing = {c["name"] for c in inspector.get_columns(table)}
        for name, ddl_type in columns.items():
            if name not in existing:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl_type}"))
                    if table == "users" and name == "email_verified_at":
                        # Accounts created before verification shipped already proved
                        # control through normal use; do not lock their owners out.
                        conn.execute(
                            text(
                                "UPDATE users SET email_verified_at = created_at "
                                "WHERE email_verified_at IS NULL"
                            )
                        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    auth_rate_limiter.reset()
    Base.metadata.create_all(bind=engine)
    add_missing_columns()
    db = SessionLocal()
    try:
        seed_exercises(db)
    finally:
        db.close()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(exercises.router)
app.include_router(routines.router)
app.include_router(workouts.router)
app.include_router(stats.router)
app.include_router(bodyweight.router)
app.include_router(devices.router)
app.include_router(sync.router)
app.include_router(live.router)


@app.get("/")
def root():
    return {"app": settings.app_name, "docs": "/docs"}


@app.get("/account-deletion", response_class=HTMLResponse, include_in_schema=False)
def account_deletion_page() -> HTMLResponse:
    html = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Delete your Rozakos Fitness account</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; background: #2c2c3e; color: #f4f4f4; }
    body { margin: 0; padding: 24px; }
    main { max-width: 520px; margin: 8vh auto; background: #353548; padding: 24px; border-radius: 14px; }
    h1 { margin-top: 0; }
    label { display: block; margin: 16px 0 6px; }
    input { box-sizing: border-box; width: 100%; padding: 12px; border: 1px solid #66667a; border-radius: 8px; background: #252535; color: #f4f4f4; }
    button { width: 100%; margin-top: 20px; padding: 12px; border: 0; border-radius: 8px; background: #dc5a5a; color: white; font-weight: 700; cursor: pointer; }
    button:disabled { opacity: .6; cursor: default; }
    p { line-height: 1.5; color: #d3d3dc; }
    #status { min-height: 24px; }
  </style>
</head>
<body>
<main>
  <h1>Delete your Rozakos Fitness account</h1>
  <p>Sign in below to permanently delete your account and all server-side workout history, routines, bodyweight entries, custom exercises, and device API keys. This cannot be undone.</p>
  <form id="delete-form">
    <label for="email">Email</label>
    <input id="email" type="email" autocomplete="username" required>
    <label for="password">Password</label>
    <input id="password" type="password" autocomplete="current-password" required>
    <button id="submit" type="submit">Permanently delete account</button>
  </form>
  <p id="status" role="status" aria-live="polite"></p>
  <p>Local-only data stored on a phone is separate from an account. Remove it by clearing the app's storage or uninstalling the app.</p>
  <p><a href="/privacy">Privacy Policy</a></p>
</main>
<script>
  const form = document.getElementById('delete-form');
  const button = document.getElementById('submit');
  const statusText = document.getElementById('status');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!confirm('Permanently delete this account and all of its data?')) return;
    button.disabled = true;
    statusText.textContent = 'Deleting account...';
    try {
      const deletion = await fetch('/auth/account-deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: document.getElementById('email').value, password: document.getElementById('password').value })
      });
      if (!deletion.ok) throw new Error(deletion.status === 429 ? 'Too many attempts. Please try again later.' : 'Email or password was not accepted.');
      form.remove();
      statusText.textContent = 'Your Rozakos Fitness account and associated server data have been permanently deleted.';
    } catch (error) {
      statusText.textContent = error instanceof Error ? error.message : 'The account could not be deleted.';
      button.disabled = false;
    }
  });
</script>
</body>
</html>"""
    return HTMLResponse(
        content=html,
        headers={
            "Cache-Control": "no-store",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/privacy", response_class=HTMLResponse, include_in_schema=False)
def privacy_policy_page() -> HTMLResponse:
    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rozakos Fitness Privacy Policy</title>
  <style>
    :root {{ color-scheme: dark; font-family: system-ui, sans-serif; background: #2c2c3e; color: #f4f4f4; }}
    body {{ margin: 0; padding: 24px; }}
    main {{ max-width: 760px; margin: 4vh auto; background: #353548; padding: 28px; border-radius: 14px; }}
    h1, h2 {{ line-height: 1.2; }} h2 {{ margin-top: 28px; }}
    p, li {{ line-height: 1.6; color: #d3d3dc; }}
    a {{ color: #56d2c3; }} code {{ color: #f4f4f4; }}
  </style>
</head>
<body><main>
  <h1>Rozakos Fitness Privacy Policy</h1>
  <p><strong>Effective date:</strong> 3 September 2026</p>
  <p>Rozakos Fitness is a strength-training log with an optional account for syncing workouts and connecting user-authorized exercise devices. It is not a medical service and does not provide medical advice.</p>

  <h2>Data you provide</h2>
  <p>In account mode, the service stores your email address, display name, a one-way password hash, routines, workouts, sets, notes, bodyweight entries, custom exercises, exercise setup preferences, form-video links, and names and access records for device API keys. Plaintext passwords and plaintext device keys are not stored.</p>
  <p>In local-only mode, workout and bodyweight data stays in the app's private storage on that device and is not sent to the Rozakos Fitness server unless you explicitly copy it into an account. In account mode, the app keeps the latest successful cloud results in its private storage for offline viewing. Android cloud backup is disabled for the app. Opening an external form-video link sends a request to that external website under its own privacy terms.</p>

  <h2>Automatically processed data</h2>
  <p>The server and its network security provider may process limited connection information such as IP address, request time, requested path, response status, and security signals. This is used only to operate, protect, troubleshoot, and prevent abuse of the service.</p>

  <h2>How data is used</h2>
  <ul>
    <li>Provide workout logging, history, progress statistics, synchronization, account access, and device integration.</li>
    <li>Send essential account messages such as email confirmation and password reset links.</li>
    <li>Secure, maintain, diagnose, and improve the service.</li>
  </ul>
  <p>Data is not sold, used for advertising, or used to build advertising profiles.</p>

  <h2>Sharing and service providers</h2>
  <p>Data is not shared with other users. Cloudflare processes network traffic as a service provider for encrypted delivery and abuse protection. Resend processes email addresses and essential confirmation or recovery messages as the transactional email provider acting on the developer's behalf. Data may also be disclosed when required by law or when necessary to protect users and the service. Rozakos Fitness does not include advertising or third-party analytics SDKs.</p>

  <h2>Security and retention</h2>
  <p>Account traffic is encrypted in transit with HTTPS. Passwords use bcrypt hashes, device API keys use SHA-256 hashes, and access tokens are stored in Android secure storage. Server data is backed up daily for recovery, with up to 30 backup copies retained.</p>
  <p>Account data remains while the account is active. Deleting an account removes its associated data from the live database immediately; residual copies age out of rotating backups within 30 days and are used only for disaster recovery. Limited security and operational logs are retained only as needed for service protection and troubleshooting.</p>

  <h2>Your choices</h2>
  <p>You can use local-only mode without creating an account. Copying local-only history into an account is an explicit action and keeps the original phone copy. Account users can permanently delete their account and associated server data inside the app, or through the public <a href="/account-deletion">account deletion page</a>. Logging out clears that account's offline cache. Local-only data can be removed through Android's Clear storage action or by uninstalling the app.</p>

  <h2>Children</h2>
  <p>Rozakos Fitness is not directed to children under 13, and knowingly collecting their personal data is not intended.</p>

  <h2>Contact and changes</h2>
  <p>Questions or privacy requests can be sent to <a href="mailto:{settings.support_email}">{settings.support_email}</a>. Material changes will be reflected on this page with a new effective date.</p>
</main></body></html>"""
    return HTMLResponse(
        content=html,
        headers={
            "Cache-Control": "public, max-age=3600",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/reset-password", response_class=HTMLResponse, include_in_schema=False)
def reset_password_page() -> HTMLResponse:
    html = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Reset your Rozakos Fitness password</title><style>
:root { color-scheme: dark; font-family: system-ui, sans-serif; background: #2c2c3e; color: #f4f4f4; }
body { margin: 0; padding: 24px; } main { max-width: 520px; margin: 8vh auto; background: #353548; padding: 24px; border-radius: 14px; }
label { display: block; margin: 16px 0 6px; } input { box-sizing: border-box; width: 100%; padding: 12px; border: 1px solid #66667a; border-radius: 8px; background: #252535; color: #f4f4f4; }
button { width: 100%; margin-top: 20px; padding: 12px; border: 0; border-radius: 8px; background: #a5211f; color: white; font-weight: 700; cursor: pointer; }
button:disabled { opacity: .6; } p { line-height: 1.5; color: #d3d3dc; }
</style></head><body><main><h1>Reset your password</h1>
<form id="reset-form"><label for="password">New password</label><input id="password" type="password" autocomplete="new-password" minlength="8" required>
<label for="confirm">Confirm new password</label><input id="confirm" type="password" autocomplete="new-password" minlength="8" required>
<button id="submit" type="submit">Update password</button></form><p id="status" role="status" aria-live="polite"></p></main>
<script>
const form = document.getElementById('reset-form'); const button = document.getElementById('submit'); const statusText = document.getElementById('status');
const token = new URLSearchParams(location.hash.slice(1)).get('token'); history.replaceState(null, '', location.pathname);
if (!token) { form.remove(); statusText.textContent = 'This reset link is invalid or incomplete.'; }
form?.addEventListener('submit', async (event) => { event.preventDefault(); const password = document.getElementById('password').value;
  if (password !== document.getElementById('confirm').value) { statusText.textContent = 'Passwords do not match.'; return; }
  button.disabled = true; statusText.textContent = 'Updating password...';
  try { const response = await fetch('/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
    if (!response.ok) { const data = await response.json(); throw new Error(data.detail || 'The password could not be updated.'); }
    form.remove(); statusText.textContent = 'Your password has been updated. You can return to the app and log in.';
  } catch (error) { statusText.textContent = error instanceof Error ? error.message : 'The password could not be updated.'; button.disabled = false; }
});
</script></body></html>"""
    return HTMLResponse(
        content=html,
        headers={
            "Cache-Control": "no-store",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
        },
    )
