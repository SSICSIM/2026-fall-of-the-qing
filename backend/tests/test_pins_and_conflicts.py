from __future__ import annotations


def delegate(client, did):
    return next(d for d in client.get("/api/map").json()["delegates"] if d["id"] == did)


def test_characters_start_off_the_map(client, delegates):
    d = delegate(client, delegates[0].id)
    assert d["x"] is None and d["y"] is None


def test_place_move_and_undo(client, delegates):
    yuan = delegates[0]
    res = client.patch(f"/api/delegates/{yuan.id}/position", json={"x": 650.04, "y": 250})
    assert res.status_code == 200
    assert (res.json()["x"], res.json()["y"]) == (650.0, 250.0)
    client.patch(f"/api/delegates/{yuan.id}/position", json={"x": 700, "y": 300})

    [moved, placed] = client.get("/api/history").json()[:2]
    assert moved["kind"] == "MOVE" and "moved" in moved["summary"]
    assert "placed" in placed["summary"]

    client.post("/api/history/undo")
    d = delegate(client, yuan.id)
    assert (d["x"], d["y"]) == (650.0, 250.0)


def test_remove_from_map(client, delegates):
    yuan = delegates[0]
    client.patch(f"/api/delegates/{yuan.id}/position", json={"x": 1, "y": 2})
    res = client.patch(f"/api/delegates/{yuan.id}/position", json={"x": None, "y": None})
    assert res.json()["x"] is None


def test_position_needs_both_coordinates(client, delegates):
    res = client.patch(f"/api/delegates/{delegates[0].id}/position", json={"x": 5})
    assert res.status_code == 422


def test_conflict_lifecycle(client, delegates, directive):
    yuan, sun, _ = delegates
    res = client.post(
        "/api/conflicts",
        json={"name": "Battle of Xuzhou", "party_ids": [yuan.id, sun.id], "crisis_note_id": directive.id},
    )
    assert res.status_code == 201
    conflict = res.json()
    assert conflict["status"] == "ONGOING"
    assert {p["name"] for p in conflict["parties"]} == {"Yuan Shikai", "Sun Yat-sen"}

    [shown] = client.get("/api/map").json()["conflicts"]
    assert shown["id"] == conflict["id"]

    res = client.post(
        f"/api/conflicts/{conflict['id']}/resolve",
        json={"winner_id": yuan.id, "outcome_summary": "The Beiyang Army holds the line."},
    )
    assert res.json()["status"] == "RESOLVED"
    assert res.json()["winner_id"] == yuan.id
    assert client.post(f"/api/conflicts/{conflict['id']}/resolve", json={}).status_code == 409

    assert client.delete(f"/api/conflicts/{conflict['id']}").status_code == 204
    assert client.get("/api/conflicts").json() == []


def test_conflict_needs_two_parties(client, delegates):
    yuan = delegates[0]
    res = client.post("/api/conflicts", json={"name": "Duel", "party_ids": [yuan.id, yuan.id]})
    assert res.status_code == 422


def test_winner_must_be_a_party(client, delegates):
    yuan, sun, zhang = delegates
    conflict = client.post("/api/conflicts", json={"name": "Skirmish", "party_ids": [yuan.id, sun.id]}).json()
    res = client.post(f"/api/conflicts/{conflict['id']}/resolve", json={"winner_id": zhang.id})
    assert res.status_code == 422


def test_deleting_a_character_drops_them_from_conflicts(client, delegates):
    yuan, sun, zhang = delegates
    client.post("/api/conflicts", json={"name": "Three-way", "party_ids": [yuan.id, sun.id, zhang.id]})
    client.delete(f"/api/characters/{zhang.id}")
    [conflict] = client.get("/api/conflicts").json()
    assert len(conflict["parties"]) == 2


def test_place_many_is_one_undo_step(client, delegates):
    yuan, sun, _ = delegates
    res = client.patch(
        "/api/delegates/positions",
        json={"positions": [{"character_id": yuan.id, "x": 10.04, "y": 20}, {"character_id": sun.id, "x": 30, "y": 40}]},
    )
    assert res.status_code == 200
    assert {(d["x"], d["y"]) for d in res.json()} == {(10.0, 20.0), (30.0, 40.0)}
    [batch] = client.get("/api/history").json()
    assert batch["summary"] == "2 characters placed"
    client.post("/api/history/undo")
    assert all(d["x"] is None for d in client.get("/api/delegates").json())


def test_place_many_unknown_character(client):
    res = client.patch("/api/delegates/positions", json={"positions": [{"character_id": 999, "x": 1, "y": 1}]})
    assert res.status_code == 404
