from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import inspect, text

from . import live
from .config import get_settings
from .database import Base, SessionLocal, engine
from .routers import auth, bodyweight, devices, exercises, routines, stats, workouts
from .seed import seed_exercises

settings = get_settings()

# Columns added after a table shipped. `create_all` only creates missing tables,
# so without this an existing fitness.db would 500 on every exercise read.
ADDED_COLUMNS: dict[str, dict[str, str]] = {
    "exercises": {"video_url": "VARCHAR(500)"},
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
