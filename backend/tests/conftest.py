import os

import pytest
from fastapi.testclient import TestClient

os.environ["ROZAKOS_DATABASE_URL"] = "sqlite:///./test_fitness.db"

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:  # context manager runs lifespan (seeds exercises)
        yield c


@pytest.fixture()
def auth(client):
    """Registered user; returns (headers, user dict)."""
    res = client.post(
        "/auth/register",
        json={"email": "bill@rozakos.com", "password": "supersecret1", "display_name": "Bill"},
    )
    assert res.status_code == 201, res.text
    data = res.json()
    return {"Authorization": f"Bearer {data['access_token']}"}, data["user"]


@pytest.fixture()
def headers(auth):
    return auth[0]


def first_exercise_id(client, headers, name="Barbell Bench Press"):
    res = client.get("/exercises", params={"search": name}, headers=headers)
    assert res.status_code == 200
    return res.json()[0]["id"]
