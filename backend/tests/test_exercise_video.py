from tests.conftest import first_exercise_id


def test_video_url_set_clear_and_validation(client, headers):
    bench = first_exercise_id(client, headers)
    assert client.get(f"/exercises/{bench}", headers=headers).json()["video_url"] is None

    url = "https://www.youtube.com/watch?v=rT7DgCr-3pg"
    res = client.patch(f"/exercises/{bench}", json={"video_url": f"  {url} "}, headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["video_url"] == url  # trimmed

    # surfaces everywhere the exercise is nested, not just on the detail route
    listed = client.get("/exercises", params={"search": "Barbell Bench"}, headers=headers).json()
    assert listed[0]["video_url"] == url

    workout = client.post("/workouts", json={}, headers=headers).json()
    added = client.post(
        f"/workouts/{workout['id']}/exercises", json={"exercise_id": bench}, headers=headers
    ).json()
    assert added["exercise"]["video_url"] == url

    # a bare domain would never open on the phone
    bad = client.patch(f"/exercises/{bench}", json={"video_url": "youtube.com/x"}, headers=headers)
    assert bad.status_code == 422

    # blank clears it; an omitted field leaves it alone
    assert client.patch(f"/exercises/{bench}", json={}, headers=headers).json()["video_url"] == url
    cleared = client.patch(f"/exercises/{bench}", json={"video_url": "  "}, headers=headers)
    assert cleared.json()["video_url"] is None


def test_video_url_on_custom_exercise_and_unknown_id(client, headers):
    res = client.post(
        "/exercises",
        json={
            "name": "Wall Ball",
            "muscle_group": "legs",
            "equipment": "other",
            "video_url": "https://youtu.be/abc123",
        },
        headers=headers,
    )
    assert res.status_code == 201, res.text
    custom = res.json()
    assert custom["video_url"] == "https://youtu.be/abc123"

    patched = client.patch(
        f"/exercises/{custom['id']}", json={"video_url": "https://youtu.be/zzz"}, headers=headers
    )
    assert patched.json()["video_url"] == "https://youtu.be/zzz"

    assert client.patch("/exercises/999999", json={"video_url": None}, headers=headers).status_code == 404
