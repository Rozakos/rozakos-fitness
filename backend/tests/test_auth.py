from datetime import date

import pytest
from pydantic import ValidationError

from app.config import INSECURE_DEVELOPMENT_SECRET, Settings
from app.database import SessionLocal
from app.models import (
    ApiKey,
    BodyweightEntry,
    Exercise,
    Routine,
    RoutineExercise,
    User,
    Workout,
    WorkoutExercise,
    WorkoutSet,
)


def test_secret_key_is_required_and_known_default_is_rejected(monkeypatch):
    monkeypatch.delenv("ROZAKOS_SECRET_KEY")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)
    with pytest.raises(ValidationError):
        Settings(_env_file=None, secret_key=INSECURE_DEVELOPMENT_SECRET)
    with pytest.raises(ValidationError):
        Settings(_env_file=None, secret_key=" " * 64)


def test_register_login_me(client):
    res = client.post(
        "/auth/register",
        json={"email": "a@b.com", "password": "password123", "display_name": "A"},
    )
    assert res.status_code == 201
    token = res.json()["access_token"]

    # duplicate email rejected
    res = client.post(
        "/auth/register",
        json={"email": "a@b.com", "password": "password123", "display_name": "A"},
    )
    assert res.status_code == 409

    res = client.post("/auth/login", json={"email": "a@b.com", "password": "password123"})
    assert res.status_code == 200

    res = client.post("/auth/login", json={"email": "a@b.com", "password": "wrongpass99"})
    assert res.status_code == 401

    res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["email"] == "a@b.com"

    res = client.get("/auth/me")
    assert res.status_code == 401


def test_login_is_rate_limited(client):
    for _ in range(10):
        res = client.post(
            "/auth/login",
            json={"email": "missing@example.com", "password": "not-the-password"},
        )
        assert res.status_code == 401

    res = client.post(
        "/auth/login",
        json={"email": "missing@example.com", "password": "not-the-password"},
    )
    assert res.status_code == 429
    assert int(res.headers["Retry-After"]) > 0


def test_delete_account_removes_all_owned_data(client, auth):
    headers, user_data = auth
    user_id = user_data["id"]

    with SessionLocal() as db:
        user = db.get(User, user_id)
        assert user is not None
        custom = Exercise(
            name="Private movement",
            muscle_group="back",
            equipment="cable",
            is_custom=True,
            owner_id=user_id,
        )
        user.custom_exercises.append(custom)
        user.api_keys.append(
            ApiKey(name="Private device", key_hash="a" * 64, prefix="rzk_private")
        )
        user.bodyweight_entries.append(BodyweightEntry(date=date(2026, 8, 31), weight_kg=80))
        builtin = db.query(Exercise).filter(Exercise.is_custom.is_(False)).first()
        assert builtin is not None
        routine = Routine(name="Private routine")
        routine.exercises.append(RoutineExercise(exercise_id=builtin.id))
        user.routines.append(routine)
        workout = Workout()
        workout_exercise = WorkoutExercise(exercise_id=builtin.id)
        workout_exercise.sets.append(WorkoutSet(reps=5, weight_kg=100))
        workout.exercises.append(workout_exercise)
        user.workouts.append(workout)
        db.commit()
        owned_ids = {
            "exercise": custom.id,
            "api_key": user.api_keys[0].id,
            "bodyweight": user.bodyweight_entries[0].id,
            "routine": user.routines[0].id,
            "routine_exercise": routine.exercises[0].id,
            "workout": user.workouts[0].id,
            "workout_exercise": workout_exercise.id,
            "workout_set": workout_exercise.sets[0].id,
        }

    res = client.delete("/auth/account", headers=headers)
    assert res.status_code == 204
    assert res.content == b""

    with SessionLocal() as db:
        assert db.get(User, user_id) is None
        assert db.get(Exercise, owned_ids["exercise"]) is None
        assert db.get(ApiKey, owned_ids["api_key"]) is None
        assert db.get(BodyweightEntry, owned_ids["bodyweight"]) is None
        assert db.get(Routine, owned_ids["routine"]) is None
        assert db.get(RoutineExercise, owned_ids["routine_exercise"]) is None
        assert db.get(Workout, owned_ids["workout"]) is None
        assert db.get(WorkoutExercise, owned_ids["workout_exercise"]) is None
        assert db.get(WorkoutSet, owned_ids["workout_set"]) is None
        assert db.query(Exercise).filter(Exercise.is_custom.is_(False)).count() > 0

    assert client.get("/auth/me", headers=headers).status_code == 401


def test_account_deletion_page(client):
    res = client.get("/account-deletion")
    assert res.status_code == 200
    assert "Delete your Rozakos Fitness account" in res.text
    assert "no-store" in res.headers["Cache-Control"]


def test_exercises_seeded_and_custom(client, headers):
    res = client.get("/exercises", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) >= 50

    res = client.get("/exercises", params={"muscle_group": "chest"}, headers=headers)
    assert all(e["muscle_group"] == "chest" for e in res.json())

    res = client.post(
        "/exercises",
        json={"name": "Rozakos Cable Machine Row", "muscle_group": "back", "equipment": "cable"},
        headers=headers,
    )
    assert res.status_code == 201
    assert res.json()["is_custom"] is True

    # custom exercise is invisible to another user
    other = client.post(
        "/auth/register",
        json={"email": "other@b.com", "password": "password123", "display_name": "O"},
    ).json()
    res = client.get(
        "/exercises",
        params={"search": "Rozakos Cable"},
        headers={"Authorization": f"Bearer {other['access_token']}"},
    )
    assert res.json() == []
