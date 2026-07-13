from tests.conftest import first_exercise_id


def make_device(client, headers, name="Garage Raspi"):
    res = client.post("/devices", json={"name": name}, headers=headers)
    assert res.status_code == 201
    return res.json()


def test_device_key_lifecycle(client, headers):
    created = make_device(client, headers)
    assert created["key"].startswith("rzk_")
    assert created["prefix"] == created["key"][:12]

    # key is not returned on listing
    listed = client.get("/devices", headers=headers).json()
    assert len(listed) == 1
    assert "key" not in listed[0]

    # bad key rejected
    res = client.get("/device/active-workout", headers={"X-API-Key": "rzk_bogus"})
    assert res.status_code == 401

    # revoked key stops working
    good = {"X-API-Key": created["key"]}
    assert client.get("/device/active-workout", headers=good).status_code == 200
    client.delete(f"/devices/{created['id']}", headers=headers)
    assert client.get("/device/active-workout", headers=good).status_code == 401


def test_device_logs_set_into_active_workout(client, headers):
    device = make_device(client, headers)
    key = {"X-API-Key": device["key"]}
    bench = first_exercise_id(client, headers)

    # no active workout yet
    assert client.get("/device/active-workout", headers=key).json()["active"] is False
    res = client.post(
        "/device/sets", json={"exercise_id": bench, "reps": 10, "weight_kg": 60}, headers=key
    )
    assert res.status_code == 409

    workout = client.post("/workouts", json={}, headers=headers).json()
    assert client.get("/device/active-workout", headers=key).json()["workout_id"] == workout["id"]

    res = client.post(
        "/device/sets", json={"exercise_id": bench, "reps": 10, "weight_kg": 60}, headers=key
    )
    assert res.status_code == 201
    assert res.json()["source"] == "device"

    # exercise was auto-added to the workout, set attached
    active = client.get("/workouts/active", headers=headers).json()
    assert len(active["exercises"]) == 1
    assert active["exercises"][0]["sets"][0]["reps"] == 10


def test_websocket_live_set_broadcast(client, headers):
    device = make_device(client, headers)
    bench = first_exercise_id(client, headers)
    workout = client.post("/workouts", json={}, headers=headers).json()
    token = headers["Authorization"].split(" ")[1]

    with client.websocket_connect(f"/ws/workout/{workout['id']}?token={token}") as phone:
        with client.websocket_connect(
            f"/ws/workout/{workout['id']}?api_key={device['key']}"
        ) as raspi:
            raspi.send_json({"type": "rep", "exercise_id": bench, "count": 3})
            msg = phone.receive_json()
            assert msg == {"type": "rep", "exercise_id": bench, "count": 3}

            raspi.send_json(
                {"type": "set_complete", "exercise_id": bench, "reps": 8, "weight_kg": 60}
            )
            msg = phone.receive_json()
            assert msg["type"] == "set_logged"
            assert msg["set"]["reps"] == 8
            assert msg["set"]["source"] == "device"

    # the set was persisted
    active = client.get("/workouts/active", headers=headers).json()
    assert active["exercises"][0]["sets"][0]["reps"] == 8


def test_websocket_rejects_bad_auth(client, headers):
    workout = client.post("/workouts", json={}, headers=headers).json()
    import pytest

    with pytest.raises(Exception):
        with client.websocket_connect(f"/ws/workout/{workout['id']}?token=nope") as ws:
            ws.receive_json()


def test_stats_prs_volume_trend(client, headers):
    bench = first_exercise_id(client, headers)

    def do_workout(sets):
        workout = client.post("/workouts", json={}, headers=headers).json()
        we = client.post(
            f"/workouts/{workout['id']}/exercises", json={"exercise_id": bench}, headers=headers
        ).json()
        for s in sets:
            client.post(
                f"/workouts/{workout['id']}/exercises/{we['id']}/sets", json=s, headers=headers
            )
        client.post(f"/workouts/{workout['id']}/finish", headers=headers)

    do_workout(
        [
            {"reps": 10, "weight_kg": 40, "is_warmup": True},  # warmups excluded from stats
            {"reps": 8, "weight_kg": 60},
            {"reps": 5, "weight_kg": 80},
        ]
    )
    do_workout([{"reps": 5, "weight_kg": 85}, {"reps": 8, "weight_kg": 62.5}])

    prs = client.get("/stats/prs", headers=headers).json()
    assert len(prs) == 1
    records = {r["reps"]: r["weight_kg"] for r in prs[0]["records"]}
    assert records[5] == 85
    assert records[8] == 62.5
    assert 10 not in records  # warmup didn't count

    volume = client.get("/stats/volume", headers=headers).json()
    assert len(volume) == 1
    expected = 8 * 60 + 5 * 80 + 5 * 85 + 8 * 62.5
    assert volume[0]["total_volume_kg"] == expected
    assert volume[0]["by_muscle_group"]["chest"] == expected

    trend = client.get(f"/stats/exercise/{bench}", headers=headers).json()
    assert len(trend) == 2
    # Epley: 85 * (1 + 5/30) ≈ 99.2
    assert trend[1]["best_est_1rm"] == 99.2
    assert trend[1]["top_weight_kg"] == 85


def test_bodyweight_upsert(client, headers):
    res = client.post("/bodyweight", json={"date": "2026-07-13", "weight_kg": 82.4}, headers=headers)
    assert res.status_code == 201
    # same day overwrites
    client.post("/bodyweight", json={"date": "2026-07-13", "weight_kg": 82.0}, headers=headers)
    entries = client.get("/bodyweight", headers=headers).json()
    assert len(entries) == 1
    assert entries[0]["weight_kg"] == 82.0
