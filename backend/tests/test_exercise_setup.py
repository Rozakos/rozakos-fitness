from tests.conftest import first_exercise_id


def test_setup_rows_set_replace_and_clear(client, headers):
    press = first_exercise_id(client, headers, "Barbell Bench Press")
    assert client.get(f"/exercises/{press}", headers=headers).json()["setup"] == []

    rows = [{"label": "  Seat height ", "value": " 4 "}, {"label": "Back pad", "value": "2"}]
    res = client.patch(f"/exercises/{press}", json={"setup": rows}, headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["setup"] == [
        {"label": "Seat height", "value": "4"},  # trimmed
        {"label": "Back pad", "value": "2"},
    ]

    # surfaces everywhere the exercise is nested, not just on the detail route
    listed = client.get("/exercises", params={"search": "Barbell Bench"}, headers=headers).json()
    assert listed[0]["setup"][0]["label"] == "Seat height"

    workout = client.post("/workouts", json={}, headers=headers).json()
    added = client.post(
        f"/workouts/{workout['id']}/exercises", json={"exercise_id": press}, headers=headers
    ).json()
    assert added["exercise"]["setup"][0]["value"] == "4"

    # PATCH replaces the whole list rather than merging
    replaced = client.patch(
        f"/exercises/{press}", json={"setup": [{"label": "Handle", "value": "wide"}]}, headers=headers
    )
    assert replaced.json()["setup"] == [{"label": "Handle", "value": "wide"}]

    # omitting the key leaves it alone; [] and null both clear it
    assert client.patch(f"/exercises/{press}", json={}, headers=headers).json()["setup"] == [
        {"label": "Handle", "value": "wide"}
    ]
    assert client.patch(f"/exercises/{press}", json={"setup": []}, headers=headers).json()["setup"] == []
    client.patch(f"/exercises/{press}", json={"setup": [{"label": "a", "value": "b"}]}, headers=headers)
    assert client.patch(f"/exercises/{press}", json={"setup": None}, headers=headers).json()["setup"] == []


def test_setup_validation(client, headers):
    press = first_exercise_id(client, headers)

    # a blank label is a row the user can never read back
    for bad in (
        [{"label": "   ", "value": "4"}],
        [{"label": "Seat", "value": ""}],
        [{"label": "S" * 41, "value": "4"}],
        [{"label": "Seat"}],
        [{"label": "Seat", "value": 4}],  # numbers are not auto-coerced
    ):
        res = client.patch(f"/exercises/{press}", json={"setup": bad}, headers=headers)
        assert res.status_code == 422, (bad, res.text)

    too_many = [{"label": f"Knob {i}", "value": str(i)} for i in range(13)]
    assert client.patch(f"/exercises/{press}", json={"setup": too_many}, headers=headers).status_code == 422


def test_builtin_preferences_are_isolated_between_users(client, headers):
    press = first_exercise_id(client, headers)
    first_values = {
        "video_url": "https://youtu.be/first",
        "setup": [{"label": "Seat", "value": "4"}],
    }
    assert client.patch(f"/exercises/{press}", json=first_values, headers=headers).status_code == 200

    other = client.post(
        "/auth/register",
        json={"email": "other@example.com", "password": "password123", "display_name": "Other"},
    ).json()
    other_headers = {"Authorization": f"Bearer {other['access_token']}"}
    other_view = client.get(f"/exercises/{press}", headers=other_headers).json()
    assert other_view["video_url"] is None
    assert other_view["setup"] == []
    assert client.patch(f"/exercises/{press}", json={}, headers=other_headers).status_code == 200
    assert (
        client.patch(f"/exercises/{press}", json={"video_url": None}, headers=other_headers).status_code
        == 200
    )

    second_values = {
        "video_url": "https://youtu.be/second",
        "setup": [{"label": "Seat", "value": "9"}],
    }
    client.patch(f"/exercises/{press}", json=second_values, headers=other_headers)
    first_view = client.get(f"/exercises/{press}", headers=headers).json()
    assert first_view["video_url"] == first_values["video_url"]
    assert first_view["setup"] == first_values["setup"]


def test_setup_on_custom_exercise_and_unknown_id(client, headers):
    res = client.post(
        "/exercises",
        json={
            "name": "Hammer Chest Press",
            "muscle_group": "chest",
            "equipment": "machine",
            "setup": [{"label": "Seat height", "value": "4"}],
        },
        headers=headers,
    )
    assert res.status_code == 201, res.text
    custom = res.json()
    assert custom["setup"] == [{"label": "Seat height", "value": "4"}]

    # created without the key at all -> empty, not null
    plain = client.post(
        "/exercises", json={"name": "Wall Ball", "muscle_group": "legs"}, headers=headers
    ).json()
    assert plain["setup"] == []

    assert (
        client.patch("/exercises/999999", json={"setup": []}, headers=headers).status_code == 404
    )
