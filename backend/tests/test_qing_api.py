from __future__ import annotations


def make(client, *names):
    return [client.post("/api/characters", json={"name": n}).json()["id"] for n in names]


def edit(client, edits, note=None):
    return client.post("/api/indicators/edits", json={"edits": edits, "note": note})


def e(cid, ind, value, mode="set"):
    return {"character_id": cid, "indicator": ind, "mode": mode, "value": value}


def row(client, cid):
    return next(r for r in client.get("/api/indicators").json() if r["character_id"] == cid)


def test_new_delegates_start_neutral(client):
    (a,) = make(client, "Alpha")
    r = row(client, a)
    assert (r["legitimacy"], r["military"], r["economics"]) == (2.5, 2.5, 2.5)
    assert r["efficiency"] == 1.0
    assert r["published_efficiency"] is None


def test_bulk_edit_set_add_and_clamp(client):
    a, b = make(client, "Alpha", "Bravo")
    res = edit(client, [e(a, "MILITARY", 4), e(b, "MILITARY", 1, "add"), e(b, "ECONOMICS", 9)])
    assert res.status_code == 201
    assert row(client, a)["military"] == 4
    assert row(client, b)["military"] == 3.5
    assert row(client, b)["economics"] == 5  # clamped to the 0-5 scale


def test_noop_edit_rejected(client):
    (a,) = make(client, "Alpha")
    assert edit(client, [e(a, "MILITARY", 2.5)]).status_code == 422


def test_run_publish_and_public_map_hides_raw_scores(client):
    a, b = make(client, "Alpha", "Bravo")
    edit(client, [e(a, "LEGITIMACY", 5), e(a, "MILITARY", 5), e(a, "ECONOMICS", 5)])
    run = client.post("/api/calculator/runs", json={"character_ids": [a, b]}).json()
    assert [r["efficiency"] for r in run["results"]] == [2.0, 1.0]
    assert run["average"] == 1.5
    assert run["band_label"] == "Can give benefits"
    assert "Wins battle" in run["outcomes"]

    # Nothing is on the map until staff confirm.
    assert client.get("/public/map-scores").json() == []
    assert client.post(f"/api/calculator/runs/{run['id']}/publish").status_code == 200
    public = client.get("/public/map-scores").json()
    assert {p["name"]: p["efficiency"] for p in public} == {"Alpha": 2.0, "Bravo": 1.0}
    assert set(public[0]) == {"character_id", "name", "efficiency"}  # no L/M/E, no notes


def test_subset_run(client):
    (a,) = make(client, "Alpha")
    edit(client, [e(a, "MILITARY", 4)])
    run = client.post(
        "/api/calculator/runs", json={"character_ids": [a], "indicators": ["MILITARY"]}
    ).json()
    assert run["results"][0]["efficiency"] == 1.6


def test_stale_run_cannot_be_published(client):
    (a,) = make(client, "Alpha")
    run = client.post("/api/calculator/runs", json={"character_ids": [a]}).json()
    edit(client, [e(a, "MILITARY", 4)])
    assert client.post(f"/api/calculator/runs/{run['id']}/publish").status_code == 409


def test_publish_twice_rejected(client):
    (a,) = make(client, "Alpha")
    run = client.post("/api/calculator/runs", json={"character_ids": [a]}).json()
    assert client.post(f"/api/calculator/runs/{run['id']}/publish").status_code == 200
    assert client.post(f"/api/calculator/runs/{run['id']}/publish").status_code == 409


def test_undo_walks_back_through_history(client):
    (a,) = make(client, "Alpha")
    edit(client, [e(a, "MILITARY", 4)])
    run = client.post("/api/calculator/runs", json={"character_ids": [a]}).json()
    client.post(f"/api/calculator/runs/{run['id']}/publish")
    assert client.get("/public/map-scores").json()[0]["efficiency"] == 1.17  # (1*1.6*1)^(1/3)

    # 1st undo: the publish. Map is blank again, scores untouched.
    assert client.post("/api/history/undo").json()["kind"] == "PUBLISH"
    assert client.get("/public/map-scores").json() == []
    assert row(client, a)["military"] == 4
    assert client.get(f"/api/calculator/runs/{run['id']}").json()["status"] == "REVERTED"

    # 2nd undo: the score edit.
    assert client.post("/api/history/undo").json()["kind"] == "SCORE_EDIT"
    assert row(client, a)["military"] == 2.5

    assert client.post("/api/history/undo").status_code == 404  # nothing left


def test_undo_restores_previous_published_value(client):
    (a,) = make(client, "Alpha")
    r1 = client.post("/api/calculator/runs", json={"character_ids": [a]}).json()
    client.post(f"/api/calculator/runs/{r1['id']}/publish")
    edit(client, [e(a, "MILITARY", 4)])
    r2 = client.post("/api/calculator/runs", json={"character_ids": [a]}).json()
    client.post(f"/api/calculator/runs/{r2['id']}/publish")
    client.post("/api/history/undo")
    assert client.get("/public/map-scores").json()[0]["efficiency"] == 1.0


def test_notes_and_groups(client):
    a, b = make(client, "Alpha", "Bravo")
    assert client.put(f"/api/indicators/{a}/notes", json={"notes": "Large army"}).status_code == 200
    assert row(client, a)["notes"] == "Large army"
    g = client.post("/api/groups", json={"name": "North", "character_ids": [a, b]})
    assert g.status_code == 201
    assert client.post("/api/groups", json={"name": "North", "character_ids": [a]}).status_code == 409
    assert client.post("/api/groups", json={"name": "X", "character_ids": [999]}).status_code == 404
    assert client.delete(f"/api/groups/{g.json()['id']}").status_code == 204


def test_settings_validation(client):
    s = client.get("/api/settings/efficiency").json()
    assert s["scale_max"] == 5 and len(s["bands"]) == 3
    bad = dict(s, bands=[dict(b) for b in s["bands"]])
    bad["bands"][-1]["max"] = 9
    assert client.put("/api/settings/efficiency", json=bad).status_code == 422
    s["bands"][0]["max"] = 0.4
    assert client.put("/api/settings/efficiency", json=s).status_code == 200


def test_character_region(client):
    r = client.post("/api/characters", json={"name": "Alpha", "region": "Zhili"}).json()
    assert r["region"] == "Zhili"
