from __future__ import annotations


def periods(client):
    return {p["name"]: p for p in client.get("/api/periods").json()}


def start(client, name="Update 1"):
    return client.post("/api/periods", json={"name": name}).json()


def test_delete_active_period_goes_back_to_previous(client, delegates):
    first = start(client)
    client.post(f"/api/periods/{first['id']}/archive")  # starts "Update 2"
    mistake = client.get("/api/periods/active").json()
    client.post(
        "/api/notes",
        json={
            "character_id": delegates[0].id,
            "title": "Oops",
            "description": "Filed in the wrong period",
            "priority": "LOW",
            "note_type": "PRIVATE_DIRECTIVE",
        },
    )
    assert periods(client)["Update 2"]["note_count"] == 1

    assert client.delete(f"/api/periods/{mistake['id']}").status_code == 204
    assert list(periods(client)) == ["Update 1"]
    active = client.get("/api/periods/active").json()
    assert active["id"] == first["id"]
    assert active["archived_at"] is None


def test_delete_archived_period_leaves_active_alone(client):
    first = start(client)
    client.post(f"/api/periods/{first['id']}/archive")
    assert client.delete(f"/api/periods/{first['id']}").status_code == 204
    assert client.get("/api/periods/active").json()["name"] == "Update 2"
    assert client.delete("/api/periods/999").status_code == 404


def test_reopen_archived_period(client):
    first = start(client)
    client.post(f"/api/periods/{first['id']}/archive")
    second = client.get("/api/periods/active").json()
    client.post(f"/api/periods/{second['id']}/archive")

    res = client.post(f"/api/periods/{first['id']}/reopen")
    assert res.status_code == 200
    assert res.json()["is_active"] is True
    by_name = periods(client)
    assert by_name["Update 1"]["is_active"] is True
    assert by_name["Update 3"]["is_active"] is False
    assert by_name["Update 3"]["archived_at"] is not None
    assert client.post(f"/api/periods/{first['id']}/reopen").status_code == 409
