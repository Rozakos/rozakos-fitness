from tests.conftest import first_exercise_id


def create_routine(client, headers):
    bench = first_exercise_id(client, headers)
    squat = first_exercise_id(client, headers, "Back Squat")
    res = client.post(
        "/routines",
        json={
            "name": "Push Day A",
            "exercises": [
                {"exercise_id": bench, "target_sets": 3, "target_reps_min": 5, "target_reps_max": 8},
                {"exercise_id": squat, "target_sets": 3, "superset_group": 1},
            ],
        },
        headers=headers,
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_routine_crud(client, headers):
    routine = create_routine(client, headers)
    assert len(routine["exercises"]) == 2
    assert routine["exercises"][0]["target_reps_max"] == 8

    res = client.put(
        f"/routines/{routine['id']}",
        json={"name": "Push Day B", "exercises": [routine["exercises"][0] | {"exercise_id": routine["exercises"][0]["exercise"]["id"]}]},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["name"] == "Push Day B"
    assert len(res.json()["exercises"]) == 1

    assert client.delete(f"/routines/{routine['id']}", headers=headers).status_code == 204
    assert client.get(f"/routines/{routine['id']}", headers=headers).status_code == 404


def test_workout_lifecycle(client, headers):
    routine = create_routine(client, headers)

    res = client.post("/workouts", json={"routine_id": routine["id"]}, headers=headers)
    assert res.status_code == 201, res.text
    workout = res.json()
    assert len(workout["exercises"]) == 2
    # targets copied from the routine for in-session hints
    assert workout["exercises"][0]["target_reps_min"] == 5
    assert workout["exercises"][0]["target_reps_max"] == 8

    # only one active workout at a time
    assert client.post("/workouts", json={}, headers=headers).status_code == 409
    assert client.get("/workouts/active", headers=headers).json()["id"] == workout["id"]

    we = workout["exercises"][0]
    for i, (reps, weight) in enumerate([(8, 60), (5, 80), (5, 85)]):
        res = client.post(
            f"/workouts/{workout['id']}/exercises/{we['id']}/sets",
            json={"reps": reps, "weight_kg": weight, "is_warmup": i == 0, "rpe": 8},
            headers=headers,
        )
        assert res.status_code == 201
    assert res.json()["set_number"] == 3

    # edit + delete a set
    set_id = res.json()["id"]
    res = client.patch(
        f"/workouts/{workout['id']}/exercises/{we['id']}/sets/{set_id}",
        json={"weight_kg": 87.5},
        headers=headers,
    )
    assert res.json()["weight_kg"] == 87.5

    # finish: untouched routine exercise (no sets) is dropped
    res = client.post(f"/workouts/{workout['id']}/finish", headers=headers)
    assert res.status_code == 200
    finished = res.json()
    assert finished["finished_at"] is not None
    assert len(finished["exercises"]) == 1
    assert client.post(f"/workouts/{workout['id']}/finish", headers=headers).status_code == 409

    # history + exercise history (ghost values)
    assert client.get("/workouts", headers=headers).json()[0]["id"] == workout["id"]
    bench = we["exercise"]["id"]
    history = client.get(f"/exercises/{bench}/history", headers=headers).json()
    assert len(history) == 1
    assert len(history[0]["sets"]) == 3


def test_add_swap_reorder_superset(client, headers):
    workout = client.post("/workouts", json={}, headers=headers).json()
    bench = first_exercise_id(client, headers)
    row = first_exercise_id(client, headers, "Barbell Row")

    res = client.post(
        f"/workouts/{workout['id']}/exercises", json={"exercise_id": bench}, headers=headers
    )
    assert res.status_code == 201
    we = res.json()

    # swap movement + assign superset group
    res = client.patch(
        f"/workouts/{workout['id']}/exercises/{we['id']}",
        json={"exercise_id": row, "superset_group": 1, "order": 5},
        headers=headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["exercise"]["id"] == row
    assert body["superset_group"] == 1
    assert body["order"] == 5

    assert (
        client.delete(f"/workouts/{workout['id']}/exercises/{we['id']}", headers=headers).status_code
        == 204
    )


def test_workout_notes_update(client, headers):
    workout = client.post("/workouts", json={}, headers=headers).json()
    res = client.patch(
        f"/workouts/{workout['id']}", json={"notes": "Felt strong today"}, headers=headers
    )
    assert res.status_code == 200
    assert res.json()["notes"] == "Felt strong today"

    # clearing notes with explicit null
    res = client.patch(f"/workouts/{workout['id']}", json={"notes": None}, headers=headers)
    assert res.json()["notes"] is None


def test_workout_isolation_between_users(client, headers):
    workout = client.post("/workouts", json={}, headers=headers).json()
    other = client.post(
        "/auth/register",
        json={"email": "other@b.com", "password": "password123", "display_name": "O"},
    ).json()
    other_headers = {"Authorization": f"Bearer {other['access_token']}"}
    assert client.get(f"/workouts/{workout['id']}", headers=other_headers).status_code == 404
