from datetime import date
from urllib.parse import parse_qs, urlparse

import pytest
from pydantic import ValidationError

from app.config import INSECURE_DEVELOPMENT_SECRET, Settings
from app.database import SessionLocal
from app.models import (
    ApiKey,
    BodyweightEntry,
    Exercise,
    ExercisePreference,
    Routine,
    RoutineExercise,
    User,
    Workout,
    WorkoutExercise,
    WorkoutSet,
)
from app.routers import auth as auth_router


def test_secret_key_is_required_and_known_default_is_rejected(monkeypatch):
    monkeypatch.delenv("ROZAKOS_SECRET_KEY")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)
    with pytest.raises(ValidationError):
        Settings(_env_file=None, secret_key=INSECURE_DEVELOPMENT_SECRET)
    with pytest.raises(ValidationError):
        Settings(_env_file=None, secret_key=" " * 64)
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            secret_key="a-production-secret-that-is-at-least-32-characters",
            require_email_verification=True,
        )


def test_register_login_me(client):
    res = client.post(
        "/auth/register",
        json={"email": "a@b.com", "password": "password123", "display_name": "A"},
    )
    assert res.status_code == 201
    token = res.json()["access_token"]
    assert res.json()["email_verification_required"] is False
    assert res.json()["user"]["email_verified"] is True

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


def test_email_verification_flow(client, monkeypatch):
    sent: list[dict[str, str]] = []
    monkeypatch.setattr(auth_router.settings, "require_email_verification", True)
    monkeypatch.setattr(
        auth_router,
        "send_email",
        lambda **message: sent.append(message) or True,
    )

    res = client.post(
        "/auth/register",
        json={"email": "verify@example.com", "password": "password123", "display_name": "V"},
    )
    assert res.status_code == 201
    assert res.json()["access_token"] is None
    assert res.json()["email_verification_required"] is True
    assert res.json()["user"]["email_verified"] is False
    assert len(sent) == 1

    res = client.post(
        "/auth/login", json={"email": "verify@example.com", "password": "password123"}
    )
    assert res.status_code == 403

    confirmation_url = sent[0]["text"].splitlines()[3]
    parsed = urlparse(confirmation_url)
    token = parse_qs(parsed.query)["token"][0]
    res = client.get("/auth/verify-email", params={"token": token})
    assert res.status_code == 200
    assert "Email confirmed" in res.text

    res = client.post(
        "/auth/login", json={"email": "verify@example.com", "password": "password123"}
    )
    assert res.status_code == 200
    assert res.json()["user"]["email_verified"] is True


def test_password_reset_flow(client, auth, monkeypatch):
    sent: list[dict[str, str]] = []
    monkeypatch.setattr(auth_router.settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(
        auth_router,
        "send_email",
        lambda **message: sent.append(message) or True,
    )

    res = client.post("/auth/forgot-password", json={"email": auth[1]["email"]})
    assert res.status_code == 202
    assert len(sent) == 1
    reset_url = sent[0]["text"].splitlines()[3]
    token = parse_qs(urlparse(reset_url).fragment)["token"][0]

    res = client.post(
        "/auth/reset-password", json={"token": token, "password": "new-password-123"}
    )
    assert res.status_code == 200
    assert client.get("/auth/me", headers=auth[0]).status_code == 401
    assert client.post(
        "/auth/login", json={"email": auth[1]["email"], "password": "new-password-123"}
    ).status_code == 200
    assert client.post(
        "/auth/reset-password", json={"token": token, "password": "another-password-123"}
    ).status_code == 400


def test_password_reset_does_not_disclose_unknown_email(client):
    res = client.post("/auth/forgot-password", json={"email": "missing@example.com"})
    assert res.status_code == 202
    assert res.json()["detail"] == "If the account exists, a password reset email has been sent"


def test_public_deletion_works_before_email_confirmation(client, monkeypatch):
    monkeypatch.setattr(auth_router.settings, "require_email_verification", True)
    monkeypatch.setattr(auth_router, "send_email", lambda **_message: True)
    res = client.post(
        "/auth/register",
        json={"email": "unverified@example.com", "password": "password123", "display_name": "U"},
    )
    assert res.status_code == 201
    assert res.json()["access_token"] is None

    res = client.post(
        "/auth/account-deletion",
        json={"email": "unverified@example.com", "password": "password123"},
    )
    assert res.status_code == 204
    with SessionLocal() as db:
        assert db.query(User).filter(User.email == "unverified@example.com").first() is None


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
        preference = ExercisePreference(
            exercise_id=builtin.id,
            video_url="https://youtu.be/private",
            setup=[{"label": "Seat", "value": "4"}],
        )
        user.exercise_preferences.append(preference)
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
            "preference": preference.id,
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
        assert db.get(ExercisePreference, owned_ids["preference"]) is None
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


def test_public_privacy_and_password_reset_pages(client):
    privacy = client.get("/privacy")
    assert privacy.status_code == 200
    assert "Rozakos Fitness Privacy Policy" in privacy.text
    assert "/account-deletion" in privacy.text

    reset = client.get("/reset-password")
    assert reset.status_code == 200
    assert "Reset your password" in reset.text
    assert "no-store" in reset.headers["Cache-Control"]


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
