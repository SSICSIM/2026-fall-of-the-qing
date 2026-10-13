from __future__ import annotations

OUTLINE = [[600, 200], [700.04, 210], [690, 300], [610, 290]]


def zhili(client):
    return next(p for p in client.get("/api/map").json()["provinces"] if p["id"] == "zhili")


def test_provinces_start_with_their_original_border(client):
    assert zhili(client)["shape"] is None


def test_redraw_border(client, directive):
    res = client.put(
        "/api/map/provinces/zhili/shape", json={"shape": OUTLINE, "crisis_note_id": directive.id, "reason": "Treaty"}
    )
    assert res.status_code == 200
    assert res.json()["shape"][1] == [700.0, 210.0]
    assert zhili(client)["shape"] == res.json()["shape"]
    [batch] = client.get("/api/history").json()
    assert batch["kind"] == "BORDER"
    assert batch["crisis_note_id"] == directive.id
    assert batch["summary"] == "Border redrawn: zhili"


def test_new_border_needs_a_crisis_note(client):
    res = client.put("/api/map/provinces/zhili/shape", json={"shape": OUTLINE})
    assert res.status_code == 422
    assert zhili(client)["shape"] is None


def test_undo_restores_previous_border(client, directive):
    note = directive.id
    client.put("/api/map/provinces/zhili/shape", json={"shape": OUTLINE, "crisis_note_id": note})
    client.put("/api/map/provinces/zhili/shape", json={"shape": OUTLINE[:3], "crisis_note_id": note})
    client.post("/api/history/undo")
    assert len(zhili(client)["shape"]) == 4
    client.post("/api/history/undo")
    assert zhili(client)["shape"] is None


def test_reset_to_original(client, directive):
    client.put("/api/map/provinces/zhili/shape", json={"shape": OUTLINE, "crisis_note_id": directive.id})
    res = client.put("/api/map/provinces/zhili/shape", json={"shape": None})
    assert res.json()["shape"] is None
    assert client.get("/api/history").json()[0]["summary"] == "Border reset: zhili"


def test_outline_needs_three_corners(client):
    res = client.put("/api/map/provinces/zhili/shape", json={"shape": [[0, 0], [1, 1]]})
    assert res.status_code == 422


def test_unknown_province_or_note(client):
    assert client.put("/api/map/provinces/atlantis/shape", json={"shape": None}).status_code == 404
    res = client.put("/api/map/provinces/zhili/shape", json={"shape": OUTLINE, "crisis_note_id": 999})
    assert res.status_code == 404


NEIGHBOUR = [[700, 200], [800, 210], [790, 300], [690, 290]]


def test_neighbours_move_in_the_same_undo_step(client, directive):
    res = client.put(
        "/api/map/provinces/zhili/shape",
        json={"shape": OUTLINE, "neighbour_shapes": {"shandong": NEIGHBOUR}, "crisis_note_id": directive.id},
    )
    assert res.status_code == 200
    state = client.get("/api/map").json()
    shandong = next(p for p in state["provinces"] if p["id"] == "shandong")
    assert shandong["shape"] == NEIGHBOUR
    [batch] = client.get("/api/history").json()
    assert batch["summary"] == "Border redrawn: zhili (also shandong)"
    client.post("/api/history/undo")
    state = client.get("/api/map").json()
    assert all(p["shape"] is None for p in state["provinces"] if p["id"] in ("zhili", "shandong"))


def test_bad_neighbours(client, directive):
    note = directive.id
    url = "/api/map/provinces/zhili/shape"
    assert client.put(url, json={"shape": OUTLINE, "neighbour_shapes": {"atlantis": NEIGHBOUR}, "crisis_note_id": note}).status_code == 404
    assert client.put(url, json={"shape": OUTLINE, "neighbour_shapes": {"zhili": NEIGHBOUR}, "crisis_note_id": note}).status_code == 422
    assert client.put(url, json={"shape": None, "neighbour_shapes": {"shandong": NEIGHBOUR}}).status_code == 422
