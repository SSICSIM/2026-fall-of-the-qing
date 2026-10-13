from __future__ import annotations

from app.services.provinces import PROVINCE_IDS


def province(state, pid):
    return next(p for p in state["provinces"] if p["id"] == pid)


def delegate(state, did):
    return next(d for d in state["delegates"] if d["id"] == did)


def test_map_lists_every_province(client):
    state = client.get("/api/map").json()
    assert [p["id"] for p in state["provinces"]] == list(PROVINCE_IDS)
    assert all(p["controller_id"] is None for p in state["provinces"])


def test_assign_province(client, delegates):
    res = client.patch("/api/map/provinces/zhili", json={"controller_id": delegates[0].id})
    assert res.status_code == 200
    assert res.json()["controller_id"] == delegates[0].id


def test_unknown_province(client):
    assert client.patch("/api/map/provinces/atlantis", json={"controller_id": None}).status_code == 404


def test_province_edit_is_undoable(client, delegates):
    client.patch("/api/map/provinces/zhili", json={"controller_id": delegates[0].id})
    client.post("/api/history/undo")
    assert province(client.get("/api/map").json(), "zhili")["controller_id"] is None


def invasion(directive, defender, **overrides):
    body = {
        "attacker_id": directive.character_id,
        "province_ids": ["shandong"],
        "crisis_note_id": directive.id,
        "defender_id": defender.id,
        "attacker_deltas": {"reputation": -1.5, "military": -0.5},
        "defender_deltas": {"economics": -1},
    }
    body.update(overrides)
    return body


def test_occupation_keeps_owner_and_applies_debuffs(client, delegates, directive):
    yuan, sun, _ = delegates
    client.patch("/api/map/provinces/shandong", json={"controller_id": sun.id})

    res = client.post("/api/map/invasions", json=invasion(directive, sun))
    assert res.status_code == 200
    state = res.json()
    shandong = province(state, "shandong")
    assert shandong["controller_id"] == sun.id  # still owned by Sun
    assert shandong["occupier_id"] == yuan.id  # held by Yuan's troops
    assert delegate(state, yuan.id)["reputation"] == 2.5
    assert delegate(state, yuan.id)["military"] == 4.5
    assert delegate(state, sun.id)["economics"] == 0.5


def test_annexation_transfers_control(client, delegates, directive):
    yuan, sun, _ = delegates
    client.patch("/api/map/provinces/shandong", json={"controller_id": sun.id})
    state = client.post("/api/map/invasions", json=invasion(directive, sun, mode="ANNEX")).json()
    assert province(state, "shandong")["controller_id"] == yuan.id
    assert province(state, "shandong")["occupier_id"] is None


def test_debuffs_clamp_to_scale(client, delegates, directive):
    yuan, sun, _ = delegates
    body = invasion(directive, sun, attacker_deltas={"reputation": -5}, defender_deltas={"economics": 5})
    state = client.post("/api/map/invasions", json=body).json()
    assert delegate(state, yuan.id)["reputation"] == 0
    assert delegate(state, sun.id)["economics"] == 5


def test_invasion_undo_restores_land_and_scores(client, delegates, directive):
    yuan, sun, _ = delegates
    client.patch("/api/map/provinces/shandong", json={"controller_id": sun.id})
    client.post("/api/map/invasions", json=invasion(directive, sun))
    client.post("/api/history/undo")
    state = client.get("/api/map").json()
    assert province(state, "shandong")["occupier_id"] is None
    assert delegate(state, yuan.id)["reputation"] == 4.0
    assert delegate(state, sun.id)["economics"] == 1.5
    [batch, _] = client.get("/api/history").json()
    assert batch["kind"] == "INVASION"
    assert batch["crisis_note_id"] == directive.id


def test_invasion_requires_private_directive(client, db, delegates, directive):
    from app.models.crisis_note import NoteType

    directive.note_type = NoteType.PUBLIC_DIRECTIVE
    db.commit()
    res = client.post("/api/map/invasions", json=invasion(directive, delegates[1]))
    assert res.status_code == 422


def test_invasion_directive_must_belong_to_attacker(client, delegates, directive):
    body = invasion(directive, delegates[2], attacker_id=delegates[1].id)
    assert client.post("/api/map/invasions", json=body).status_code == 422


def test_cannot_invade_self(client, delegates, directive):
    body = invasion(directive, delegates[0])
    assert client.post("/api/map/invasions", json=body).status_code == 422


def test_retaking_own_land_lifts_occupation(client, delegates, directive):
    yuan, sun, _ = delegates
    client.patch("/api/map/provinces/shandong", json={"controller_id": yuan.id, "occupier_id": sun.id})
    body = invasion(directive, sun, attacker_deltas={}, defender_deltas={})
    state = client.post("/api/map/invasions", json=body).json()
    assert province(state, "shandong") == {
        "id": "shandong",
        "controller_id": yuan.id,
        "co_holder_ids": [],
        "occupier_id": None,
        "contested_by_id": None,
        "shape": None,
    }


def test_freehand_line_and_erase(client):
    res = client.post(
        "/api/map/annotations",
        json={"kind": "LINE", "points": [[10, 10], [20, 25.55], [30, 40]], "dashed": True, "color": "#3b2a1a"},
    )
    assert res.status_code == 201
    line = res.json()
    assert line["points"][1] == [20, 25.6]
    assert len(client.get("/api/map").json()["annotations"]) == 1
    assert client.delete(f"/api/map/annotations/{line['id']}").status_code == 204
    assert client.get("/api/map").json()["annotations"] == []


def test_war_pin_linked_to_crisis_note(client, directive):
    res = client.post(
        "/api/map/annotations",
        json={"kind": "PIN", "points": [[500, 300]], "label": "Siege of Jinan", "crisis_note_id": directive.id},
    )
    assert res.status_code == 201
    pin = res.json()
    assert pin["crisis_note_id"] == directive.id
    res = client.patch(f"/api/map/annotations/{pin['id']}", json={"label": "Fall of Jinan"})
    assert res.json()["label"] == "Fall of Jinan"


def test_annotation_shape_validation(client):
    assert client.post("/api/map/annotations", json={"kind": "PIN", "points": [[1, 1], [2, 2]]}).status_code == 422
    assert client.post("/api/map/annotations", json={"kind": "LINE", "points": [[1, 1]]}).status_code == 422
    assert client.post(
        "/api/map/annotations", json={"kind": "PIN", "points": [[1, 1]], "crisis_note_id": 999}
    ).status_code == 404


def test_deleting_character_frees_their_provinces(client, delegates):
    client.patch("/api/map/provinces/zhili", json={"controller_id": delegates[0].id})
    client.delete(f"/api/characters/{delegates[0].id}")
    assert province(client.get("/api/map").json(), "zhili")["controller_id"] is None
