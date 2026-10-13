from __future__ import annotations

from app.models.crisis_note import Character
from app.models.war_room import Province
from app.services.provinces import PROVINCE_IDS
from app.services.roster import ROSTER, seed_roster, starting_holders


def province(client, pid):
    return next(p for p in client.get("/api/map").json()["provinces"] if p["id"] == pid)


def test_share_a_province(client, delegates):
    yuan, sun, zhang = delegates
    res = client.patch(
        "/api/map/provinces/zhili",
        json={"controller_id": yuan.id, "co_holder_ids": [sun.id, zhang.id, sun.id, yuan.id]},
    )
    assert res.status_code == 200
    assert res.json()["co_holder_ids"] == [sun.id, zhang.id]


def test_clearing_owner_clears_sharers(client, delegates):
    yuan, sun, _ = delegates
    client.patch("/api/map/provinces/zhili", json={"controller_id": yuan.id, "co_holder_ids": [sun.id]})
    res = client.patch("/api/map/provinces/zhili", json={"controller_id": None})
    assert res.json()["controller_id"] is None and res.json()["co_holder_ids"] == []


def test_clear_sharers_only(client, delegates):
    yuan, sun, _ = delegates
    client.patch("/api/map/provinces/zhili", json={"controller_id": yuan.id, "co_holder_ids": [sun.id]})
    res = client.patch("/api/map/provinces/zhili", json={"co_holder_ids": []})
    assert res.json()["controller_id"] == yuan.id and res.json()["co_holder_ids"] == []


def test_sharing_is_undoable(client, delegates):
    yuan, sun, _ = delegates
    client.patch("/api/map/provinces/zhili", json={"controller_id": yuan.id})
    client.patch("/api/map/provinces/zhili", json={"co_holder_ids": [sun.id]})
    client.post("/api/history/undo")
    assert province(client, "zhili")["co_holder_ids"] == []


def test_unknown_sharer(client, delegates):
    res = client.patch(
        "/api/map/provinces/zhili", json={"controller_id": delegates[0].id, "co_holder_ids": [999]}
    )
    assert res.status_code == 404


def test_create_character_in_provinces(client, delegates):
    yuan = delegates[0]
    client.patch("/api/map/provinces/zhili", json={"controller_id": yuan.id})
    res = client.post(
        "/api/characters",
        json={"name": "Cao Kun", "province_ids": ["zhili", "henan"], "x": 10.04, "y": 20},
    )
    assert res.status_code == 201
    cao = res.json()["id"]
    assert province(client, "zhili")["controller_id"] == yuan.id
    assert province(client, "zhili")["co_holder_ids"] == [cao]
    assert province(client, "henan")["controller_id"] == cao
    pin = next(d for d in client.get("/api/map").json()["delegates"] if d["id"] == cao)
    assert (pin["x"], pin["y"]) == (10.0, 20.0)


def test_create_character_unknown_province(client):
    res = client.post("/api/characters", json={"name": "Nobody", "province_ids": ["atlantis"]})
    assert res.status_code == 422
    assert client.get("/api/characters").json() == []


def test_create_character_without_provinces(client):
    assert client.post("/api/characters", json={"name": "Nobody"}).status_code == 201
    assert all(p["controller_id"] is None for p in client.get("/api/map").json()["provinces"])


def test_deleting_character_drops_their_share(client, db, delegates):
    yuan, sun, _ = delegates
    client.patch("/api/map/provinces/zhili", json={"controller_id": yuan.id, "co_holder_ids": [sun.id]})
    assert client.delete(f"/api/characters/{sun.id}").status_code == 204
    assert province(client, "zhili")["co_holder_ids"] == []


def test_co_holder_retaking_lifts_occupation(client, delegates, directive):
    yuan, sun, zhang = delegates
    client.patch(
        "/api/map/provinces/shandong",
        json={"controller_id": zhang.id, "co_holder_ids": [yuan.id], "occupier_id": sun.id},
    )
    body = {
        "attacker_id": yuan.id,
        "province_ids": ["shandong"],
        "crisis_note_id": directive.id,
        "mode": "OCCUPY",
    }
    assert client.post("/api/map/invasions", json=body).status_code == 200
    p = province(client, "shandong")
    assert p["occupier_id"] is None and p["controller_id"] == zhang.id


def test_annexing_leaves_one_holder(client, delegates, directive):
    yuan, sun, zhang = delegates
    client.patch("/api/map/provinces/shandong", json={"controller_id": sun.id, "co_holder_ids": [zhang.id]})
    body = {
        "attacker_id": yuan.id,
        "province_ids": ["shandong"],
        "crisis_note_id": directive.id,
        "mode": "ANNEX",
    }
    client.post("/api/map/invasions", json=body)
    p = province(client, "shandong")
    assert p["controller_id"] == yuan.id and p["co_holder_ids"] == []


# ── The guide roster ────────────────────────────────────────────────────────


def test_roster_matches_the_guides():
    assert len(ROSTER) == 23
    assert len({e.name for e in ROSTER}) == 23
    for entry in ROSTER:
        assert set(entry.provinces) <= set(PROVINCE_IDS), entry.name
    holders = starting_holders()
    assert "tibet" not in holders
    assert holders["yunnan"] == ["Tang Jiyao"]
    assert holders["guangxi"][0] == "Li Zongren"
    assert set(holders["guangdong"]) == {"Chen Jiongming", "Li Zongren", "Chen Lianbo"}
    assert holders["zhili"] == ["Wu Peifu", "Cao Kun", "Sun Chuanfang", "Aisin Gioro Puyi"]
    assert set(holders) == set(PROVINCE_IDS) - {"tibet"}


def test_seed_roster(db):
    seed_roster(db)
    names = {c.name: c for c in db.query(Character).all()}
    assert len(names) == 23
    provinces = {p.id: p for p in db.query(Province).all()}
    assert provinces["yunnan"].controller_id == names["Tang Jiyao"].id
    assert provinces["yunnan"].co_holder_ids == []
    assert len(provinces["zhili"].co_holder_ids) == 3
    assert provinces["tibet"].controller_id is None


def test_seed_keeps_existing_control_unless_reset(db, delegates):
    yuan = delegates[0]
    db.add(Province(id="zhili", controller_id=yuan.id))
    db.commit()
    seed_roster(db)
    assert db.get(Province, "zhili").controller_id == yuan.id
    seed_roster(db, reset_map=True)
    assert db.get(Province, "zhili").controller_id != yuan.id
    # "Zhang Zuolin" is already in the fixture, so it is reused, not duplicated.
    assert len(db.query(Character).all()) == 25
