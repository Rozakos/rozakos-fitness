from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import live
from .config import get_settings
from .database import Base, SessionLocal, engine
from .routers import auth, bodyweight, devices, exercises, routines, stats, workouts
from .seed import seed_exercises

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
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
