from __future__ import annotations

from app.models.crisis_note import Character, Faction
from app.services.roster import FACTIONS, ROSTER, seed_roster


def delegate(client, did):
    return next(d for d in client.get("/api/map").json()["delegates"] if d["id"] == did)


def test_create_and_list_factions(client):
    res = client.post("/api/factions", json={"name": "Zhili", "color": "#5f6378"})
    assert res.status_code == 201
    assert client.post("/api/factions", json={"name": "Zhili"}).status_code == 409
    state = client.get("/api/map").json()
    assert [f["name"] for f in state["factions"]] == ["Zhili"]


def test_members_take_the_faction_colour(client, delegates):
    yuan = delegates[0]
    client.patch(f"/api/delegates/{yuan.id}", json={"color": "#111111"})
    assert delegate(client, yuan.id)["color"] == "#111111"
    fid = client.post("/api/factions", json={"name": "Beiyang", "color": "#222222"}).json()["id"]
    client.patch(f"/api/delegates/{yuan.id}", json={"faction_id": fid})
    d = delegate(client, yuan.id)
    assert d["faction_id"] == fid and d["color"] == "#222222"
    client.patch(f"/api/factions/{fid}", json={"color": "#333333"})
    assert delegate(client, yuan.id)["color"] == "#333333"


def test_deleting_a_faction_keeps_its_members(client, delegates):
    yuan = delegates[0]
    fid = client.post("/api/factions", json={"name": "Beiyang", "color": "#222222"}).json()["id"]
    client.patch(f"/api/delegates/{yuan.id}", json={"faction_id": fid})
    assert client.delete(f"/api/factions/{fid}").status_code == 204
    d = delegate(client, yuan.id)
    assert d["faction_id"] is None and d["color"] is None


def test_unknown_faction(client, delegates):
    assert client.patch(f"/api/delegates/{delegates[0].id}", json={"faction_id": 999}).status_code == 404
    assert client.post("/api/characters", json={"name": "Nobody", "faction_id": 999}).status_code == 404


def test_create_character_in_a_faction(client):
    fid = client.post("/api/factions", json={"name": "Fengtian", "color": "#c0721f"}).json()["id"]
    cid = client.post("/api/characters", json={"name": "Zhang Xueliang", "faction_id": fid}).json()["id"]
    assert delegate(client, cid)["faction_id"] == fid


def test_seed_creates_the_guide_factions(db):
    seed_roster(db)
    factions = {f.name: f for f in db.query(Faction).all()}
    assert set(factions) == set(FACTIONS)
    people = {c.name: c for c in db.query(Character).all()}
    assert people["Wu Peifu"].faction_id == factions["Zhili"].id
    assert people["Tang Jiyao"].faction_id == factions["Federalists"].id
    assert people["Friedlich Zhenya-Isao Johnston"].faction_id is None
    zhili = [e.name for e in ROSTER if e.faction == "Zhili"]
    assert zhili == ["Wu Peifu", "Cao Kun", "Sun Chuanfang", "Aisin Gioro Puyi"]


def test_seed_puts_johnston_in_shanghai(db):
    from app.services.roster import LEGATION_PIN

    seed_roster(db)
    johnston = db.query(Character).filter(Character.name == "Friedlich Zhenya-Isao Johnston").one()
    assert (johnston.x, johnston.y) == LEGATION_PIN


def test_seed_sets_home_provinces(db):
    seed_roster(db)
    home = {c.name: c.home_province_id for c in db.query(Character).all()}
    assert home["Wu Peifu"] == "zhili"
    assert home["Zhang Zuolin"] == "fengtian"
    assert home["Li Zongren"] == "guangxi"
    assert home["Ma Hongkui"] == "gansu"
    assert home["Friedlich Zhenya-Isao Johnston"] is None


def test_home_province_from_create_and_profile(client, delegates):
    cid = client.post("/api/characters", json={"name": "Cao Kun", "province_ids": ["henan", "zhili"]}).json()["id"]
    assert delegate(client, cid)["home_province_id"] == "henan"
    assert client.patch(f"/api/delegates/{cid}", json={"home_province_id": "zhili"}).status_code == 200
    assert delegate(client, cid)["home_province_id"] == "zhili"
    assert client.patch(f"/api/delegates/{cid}", json={"home_province_id": "atlantis"}).status_code == 404
