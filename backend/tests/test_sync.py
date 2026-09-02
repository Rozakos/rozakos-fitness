from .conftest import first_exercise_id


def local_payload(exercise_id: int) -> dict:
    return {
        "import_id": "phone-7-revision-3",
        "custom_exercises": [
            {
                "local_id": 1_000_000,
                "name": "Garage Pulley Row",
                "muscle_group": "back",
                "equipment": "cable",
                "rest_seconds_default": 90,
                "video_url": "https://example.com/row",
                "setup": [{"label": "Pin", "value": "8"}],
            }
        ],
        "exercise_preferences": [
            {
                "exercise_id": exercise_id,
                "video_url": "https://example.com/local-bench",
                "setup": [{"label": "Rack", "value": "5"}],
            }
        ],
        "routines": [
            {
                "local_id": 1_000_010,
                "name": "Imported push",
                "created_at": "2026-08-01T09:00:00Z",
                "exercises": [
                    {
                        "exercise_id": exercise_id,
                        "order": 0,
                        "superset_group": None,
                        "target_sets": 3,
                        "target_reps_min": 6,
                        "target_reps_max": 8,
                    },
                    {
                        "exercise_id": 1_000_000,
                        "order": 1,
                        "superset_group": None,
                        "target_sets": 3,
                        "target_reps_min": 8,
                        "target_reps_max": 12,
                    },
                ],
            }
        ],
        "workouts": [
            {
                "local_id": 1_000_020,
                "routine_id": 1_000_010,
                "started_at": "2026-08-02T09:00:00Z",
                "finished_at": "2026-08-02T10:00:00Z",
                "notes": "Moved from this phone",
                "exercises": [
                    {
                        "exercise_id": exercise_id,
                        "order": 0,
                        "superset_group": None,
                        "target_reps_min": 6,
                        "target_reps_max": 8,
                        "sets": [
                            {
                                "set_number": 1,
                                "reps": 8,
                                "weight_kg": 80,
                                "rpe": 8.5,
                                "is_warmup": False,
                                "completed_at": "2026-08-02T09:10:00Z",
                                "source": "manual",
                            }
                        ],
                    },
                    {
                        "exercise_id": 1_000_000,
                        "order": 1,
                        "superset_group": None,
                        "target_reps_min": 8,
                        "target_reps_max": 12,
                        "sets": [],
                    },
                ],
            }
        ],
        "bodyweight": [
            {"date": "2026-08-01", "weight_kg": 81.2},
            {"date": "2026-08-02", "weight_kg": 81.0},
        ],
    }


def test_import_local_data_is_complete_and_idempotent(client, headers):
    bench_id = first_exercise_id(client, headers)
    cloud_preference = client.patch(
        f"/exercises/{bench_id}",
        json={"video_url": "https://example.com/cloud-bench"},
        headers=headers,
    )
    assert cloud_preference.status_code == 200
    existing_weight = client.post(
        "/bodyweight",
        json={"date": "2026-08-01", "weight_kg": 82.5},
        headers=headers,
    )
    assert existing_weight.status_code == 201

    payload = local_payload(bench_id)
    first = client.post("/sync/import-local", json=payload, headers=headers)
    assert first.status_code == 200, first.text
    assert first.json() == {
        "already_imported": False,
        "custom_exercises": 1,
        "exercise_preferences": 0,
        "routines": 1,
        "workouts": 1,
        "sets": 1,
        "bodyweight": 1,
    }

    custom = client.get(
        "/exercises", params={"search": "Garage Pulley Row"}, headers=headers
    ).json()
    assert len(custom) == 1
    assert custom[0]["video_url"] == "https://example.com/row"
    assert custom[0]["setup"] == [{"label": "Pin", "value": "8"}]

    bench = client.get(f"/exercises/{bench_id}", headers=headers).json()
    assert bench["video_url"] == "https://example.com/cloud-bench"

    routines = client.get("/routines", headers=headers).json()
    assert len(routines) == 1
    assert [row["exercise"]["name"] for row in routines[0]["exercises"]] == [
        "Barbell Bench Press",
        "Garage Pulley Row",
    ]

    history = client.get("/workouts", headers=headers).json()
    assert len(history) == 1
    workout = client.get(f"/workouts/{history[0]['id']}", headers=headers).json()
    assert workout["notes"] == "Moved from this phone"
    assert len(workout["exercises"]) == 1
    assert workout["exercises"][0]["sets"][0]["weight_kg"] == 80

    bodyweight = client.get("/bodyweight", headers=headers).json()
    assert [(row["date"], row["weight_kg"]) for row in bodyweight] == [
        ("2026-08-02", 81.0),
        ("2026-08-01", 82.5),
    ]

    retry = client.post("/sync/import-local", json=payload, headers=headers)
    assert retry.status_code == 200
    assert retry.json() == {**first.json(), "already_imported": True}
    assert len(client.get("/workouts", headers=headers).json()) == 1
    assert len(client.get("/routines", headers=headers).json()) == 1


def test_import_rejects_second_active_workout_without_partial_changes(client, headers):
    bench_id = first_exercise_id(client, headers)
    assert client.post("/workouts", json={}, headers=headers).status_code == 201
    payload = local_payload(bench_id)
    payload["workouts"][0]["finished_at"] = None

    response = client.post("/sync/import-local", json=payload, headers=headers)

    assert response.status_code == 409
    assert "active workout" in response.json()["detail"]
    assert client.get(
        "/exercises", params={"search": "Garage Pulley Row"}, headers=headers
    ).json() == []
    assert client.get("/routines", headers=headers).json() == []


def test_import_rejects_unknown_exercise_reference(client, headers):
    bench_id = first_exercise_id(client, headers)
    payload = local_payload(bench_id)
    payload["workouts"][0]["exercises"][0]["exercise_id"] = 999_999

    response = client.post("/sync/import-local", json=payload, headers=headers)

    assert response.status_code == 422
    assert response.json()["detail"] == "Unknown built-in exercise id: 999999"
