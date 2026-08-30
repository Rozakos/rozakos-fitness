from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from sqlalchemy import inspect, text

from . import live
from .config import get_settings
from .database import Base, SessionLocal, engine
from .rate_limit import auth_rate_limiter
from .routers import auth, bodyweight, devices, exercises, routines, stats, workouts
from .seed import seed_exercises

settings = get_settings()

# Columns added after a table shipped. `create_all` only creates missing tables,
# so without this an existing fitness.db would 500 on every exercise read.
ADDED_COLUMNS: dict[str, dict[str, str]] = {
    "exercises": {"video_url": "VARCHAR(500)", "setup": "TEXT"},
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
      const login = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: document.getElementById('email').value, password: document.getElementById('password').value })
      });
      if (!login.ok) throw new Error(login.status === 429 ? 'Too many attempts. Please try again later.' : 'Email or password was not accepted.');
      const session = await login.json();
      const deletion = await fetch('/auth/account', { method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!deletion.ok) throw new Error('The account could not be deleted. Please try again.');
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
