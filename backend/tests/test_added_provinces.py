from __future__ import annotations

SQUARE = [[100, 100], [140, 100], [140, 140], [100, 140]]


def province(client, pid):
    return next((p for p in client.get("/api/map").json()["provinces"] if p["id"] == pid), None)


def test_add_province_takes_land_from_neighbours(client, delegates, directive):
    res = client.post(
        "/api/map/provinces",
        json={
            "name": "Chahar",
            "shape": SQUARE,
            "neighbour_shapes": {"zhili": [[0, 0], [10, 0], [10, 10]]},
            "controller_id": delegates[0].id,
            "crisis_note_id": directive.id,
        },
    )
    assert res.status_code == 201
    added = res.json()
    assert added["id"] == "chahar"
    assert added["name"] == "Chahar"
    assert added["custom"] is True
    assert added["controller_id"] == delegates[0].id
    assert province(client, "zhili")["shape"] == [[0, 0], [10, 0], [10, 10]]
    # The new province works like any other.
    assert client.patch(f"/api/delegates/{delegates[1].id}", json={"home_province_id": "chahar"}).status_code == 200


def test_undo_removes_added_province_and_restores_neighbours(client, directive):
    client.post(
        "/api/map/provinces",
        json={"name": "Chahar", "shape": SQUARE, "neighbour_shapes": {"zhili": SQUARE}},
    )
    assert client.post("/api/history/undo", json={}).status_code == 200
    assert province(client, "chahar") is None
    assert province(client, "zhili")["shape"] is None


def test_names_must_be_unique(client):
    assert client.post("/api/map/provinces", json={"name": "Zhili", "shape": SQUARE}).status_code == 409
    assert client.post("/api/map/provinces", json={"name": "Chahar", "shape": SQUARE}).status_code == 201
    assert client.post("/api/map/provinces", json={"name": "chahar", "shape": SQUARE}).status_code == 409


def test_remove_added_province_only(client, delegates):
    client.post("/api/map/provinces", json={"name": "Chahar", "shape": SQUARE})
    client.patch(f"/api/delegates/{delegates[0].id}", json={"home_province_id": "chahar"})
    assert client.delete("/api/map/provinces/zhili").status_code == 409
    assert client.delete("/api/map/provinces/chahar").status_code == 204
    assert province(client, "chahar") is None
    yuan = next(d for d in client.get("/api/delegates").json() if d["id"] == delegates[0].id)
    assert yuan["home_province_id"] is None
    # Re-adding the same name brings the province back.
    assert client.post("/api/map/provinces", json={"name": "Chahar", "shape": SQUARE}).status_code == 201
    assert client.post("/api/history/undo", json={}).status_code == 200
    assert province(client, "chahar") is None
