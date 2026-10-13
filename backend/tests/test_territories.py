from __future__ import annotations

AREA = [[640, 300], [700, 300], [700, 350], [640, 350]]


def state(client):
    return client.get("/api/map").json()


def province(client, pid):
    return next(p for p in state(client)["provinces"] if p["id"] == pid)


def invasion(directive, defender, **overrides):
    body = {
        "attacker_id": directive.character_id,
        "crisis_note_id": directive.id,
        "defender_id": defender.id,
    }
    body.update(overrides)
    return body


def test_take_part_of_a_province(client, delegates, directive):
    yuan, sun, _ = delegates
    client.patch("/api/map/provinces/jiangsu", json={"controller_id": sun.id})
    res = client.post(
        "/api/map/invasions",
        json=invasion(directive, sun, province_ids=["jiangsu"], area=AREA, mode="ANNEX"),
    )
    assert res.status_code == 200
    [territory] = res.json()["territories"]
    assert territory["holder_id"] == yuan.id
    assert territory["defender_id"] == sun.id
    assert territory["province_id"] == "jiangsu"
    assert territory["status"] == "ANNEXED"
    assert territory["crisis_note_id"] == directive.id
    # The rest of the province stays with the defender.
    assert province(client, "jiangsu")["controller_id"] == sun.id
    assert client.get("/api/history").json()[0]["summary"] == "Yuan Shikai annexes part of jiangsu from Sun Yat-sen"


def test_area_without_a_province(client, delegates, directive):
    res = client.post("/api/map/invasions", json=invasion(directive, delegates[1], area=AREA))
    assert res.json()["territories"][0]["province_id"] is None
    assert res.json()["territories"][0]["status"] == "OCCUPIED"


def test_needs_provinces_or_an_area(client, delegates, directive):
    assert client.post("/api/map/invasions", json=invasion(directive, delegates[1])).status_code == 422


def test_undoing_the_invasion_removes_the_area(client, delegates, directive):
    client.post("/api/map/invasions", json=invasion(directive, delegates[1], area=AREA))
    client.post("/api/history/undo")
    assert state(client)["territories"] == []


def test_contested_area_then_settled(client, delegates, directive):
    yuan, sun, _ = delegates
    res = client.post("/api/map/invasions", json=invasion(directive, sun, area=AREA, mode="CONTEST"))
    [t] = res.json()["territories"]
    assert t["status"] == "CONTESTED"

    # Attacker wins: the strip becomes theirs outright.
    res = client.patch(f"/api/map/territories/{t['id']}", json={"status": "ANNEXED"})
    assert res.json()["status"] == "ANNEXED"
    client.post("/api/history/undo")
    assert state(client)["territories"][0]["status"] == "CONTESTED"

    # Or it changes hands.
    res = client.patch(f"/api/map/territories/{t['id']}", json={"holder_id": sun.id, "status": "ANNEXED"})
    assert res.json()["holder_id"] == sun.id


def test_return_territory_and_undo(client, delegates, directive):
    res = client.post("/api/map/invasions", json=invasion(directive, delegates[1], area=AREA))
    tid = res.json()["territories"][0]["id"]
    assert client.delete(f"/api/map/territories/{tid}").status_code == 204
    assert state(client)["territories"] == []
    assert client.delete(f"/api/map/territories/{tid}").status_code == 404
    client.post("/api/history/undo")
    assert [t["id"] for t in state(client)["territories"]] == [tid]


def test_territory_needs_a_holder(client, delegates, directive):
    res = client.post("/api/map/invasions", json=invasion(directive, delegates[1], area=AREA))
    tid = res.json()["territories"][0]["id"]
    assert client.patch(f"/api/map/territories/{tid}", json={"holder_id": None}).status_code == 422
    assert client.patch(f"/api/map/territories/{tid}", json={"holder_id": 999}).status_code == 404


def test_contest_a_whole_province(client, delegates, directive):
    yuan, sun, _ = delegates
    client.patch("/api/map/provinces/shandong", json={"controller_id": sun.id})
    client.post("/api/map/invasions", json=invasion(directive, sun, province_ids=["shandong"], mode="CONTEST"))
    p = province(client, "shandong")
    assert (p["controller_id"], p["occupier_id"], p["contested_by_id"]) == (sun.id, None, yuan.id)

    # Annexing settles the dispute in the attacker's favour.
    client.post("/api/map/invasions", json=invasion(directive, sun, province_ids=["shandong"], mode="ANNEX"))
    p = province(client, "shandong")
    assert (p["controller_id"], p["contested_by_id"]) == (yuan.id, None)


def test_settle_contested_province_by_hand(client, delegates):
    yuan, sun, _ = delegates
    client.patch("/api/map/provinces/shandong", json={"controller_id": sun.id, "contested_by_id": yuan.id})
    res = client.patch("/api/map/provinces/shandong", json={"contested_by_id": None})
    assert res.json()["contested_by_id"] is None


def test_conflict_winner_takes_an_area(client, delegates):
    yuan, sun, _ = delegates
    res = client.post(
        "/api/map/territories",
        json={
            "holder_id": yuan.id,
            "defender_id": sun.id,
            "province_id": "jiangsu",
            "polygon": AREA,
            "reason": "Won the Battle of Xuzhou",
        },
    )
    assert res.status_code == 201
    assert res.json()["status"] == "ANNEXED"
    [batch] = client.get("/api/history").json()
    assert batch["summary"] == "Yuan Shikai takes part of jiangsu"
    client.post("/api/history/undo")
    assert state(client)["territories"] == []


def test_create_territory_validates(client, delegates):
    body = {"holder_id": delegates[0].id, "polygon": AREA}
    assert client.post("/api/map/territories", json={**body, "holder_id": 999}).status_code == 404
    assert client.post("/api/map/territories", json={**body, "province_id": "atlantis"}).status_code == 404
    assert client.post("/api/map/territories", json={**body, "polygon": AREA[:2]}).status_code == 422
