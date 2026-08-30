from tests.conftest import first_exercise_id


def log(client, headers, workout_id, we_id, reps=8, weight=60.0):
    res = client.post(
        f"/workouts/{workout_id}/exercises/{we_id}/sets",
        json={"reps": reps, "weight_kg": weight},
        headers=headers,
    )
    assert res.status_code in (200, 201), res.text
    return res.json()


def test_history_reports_the_order_lifts_were_actually_worked(client, headers):
    bench = first_exercise_id(client, headers, "Barbell Bench Press")
    squat = first_exercise_id(client, headers, "Back Squat")

    workout = client.post("/workouts", json={}, headers=headers).json()
    wid = workout["id"]
    # bench is added to the session list first...
    bench_we = client.post(
        f"/workouts/{wid}/exercises", json={"exercise_id": bench}, headers=headers
    ).json()
    squat_we = client.post(
        f"/workouts/{wid}/exercises", json={"exercise_id": squat}, headers=headers
    ).json()
    # ...but squat is the one actually worked first
    log(client, headers, wid, squat_we["id"])
    log(client, headers, wid, bench_we["id"])
    client.post(f"/workouts/{wid}/finish", headers=headers)

    squat_hist = client.get(f"/exercises/{squat}/history", headers=headers).json()
    assert (squat_hist[0]["position"], squat_hist[0]["total_exercises"]) == (1, 2)

    bench_hist = client.get(f"/exercises/{bench}/history", headers=headers).json()
    assert (bench_hist[0]["position"], bench_hist[0]["total_exercises"]) == (2, 2)


def test_position_follows_sets_not_the_reorderable_session_list(client, headers):
    bench = first_exercise_id(client, headers, "Barbell Bench Press")
    squat = first_exercise_id(client, headers, "Back Squat")

    workout = client.post("/workouts", json={}, headers=headers).json()
    wid = workout["id"]
    bench_we = client.post(
        f"/workouts/{wid}/exercises", json={"exercise_id": bench}, headers=headers
    ).json()
    squat_we = client.post(
        f"/workouts/{wid}/exercises", json={"exercise_id": squat}, headers=headers
    ).json()
    log(client, headers, wid, bench_we["id"])
    log(client, headers, wid, squat_we["id"])

    # dragging bench to the bottom of the card list must not rewrite history
    client.patch(f"/workouts/{wid}/exercises/{bench_we['id']}", json={"order": 99}, headers=headers)
    client.post(f"/workouts/{wid}/finish", headers=headers)

    bench_hist = client.get(f"/exercises/{bench}/history", headers=headers).json()
    assert bench_hist[0]["position"] == 1


def test_exercises_without_sets_are_not_counted(client, headers):
    bench = first_exercise_id(client, headers, "Barbell Bench Press")
    squat = first_exercise_id(client, headers, "Back Squat")

    workout = client.post("/workouts", json={}, headers=headers).json()
    wid = workout["id"]
    bench_we = client.post(
        f"/workouts/{wid}/exercises", json={"exercise_id": bench}, headers=headers
    ).json()
    client.post(f"/workouts/{wid}/exercises", json={"exercise_id": squat}, headers=headers)
    log(client, headers, wid, bench_we["id"])
    client.post(f"/workouts/{wid}/finish", headers=headers)

    hist = client.get(f"/exercises/{bench}/history", headers=headers).json()
    assert (hist[0]["position"], hist[0]["total_exercises"]) == (1, 1)
