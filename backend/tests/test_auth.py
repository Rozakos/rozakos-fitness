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
