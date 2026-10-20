from __future__ import annotations

import pytest


def test_list_delegates_has_default_scores(client, db):
    from app.models.crisis_note import Character

    db.add(Character(name="Duan Qirui"))
    db.commit()
    [d] = client.get("/api/delegates").json()
    assert (d["reputation"], d["economics"], d["military"]) == (2.5, 2.5, 2.5)
    assert d["published_efficiency"] is None


def test_bulk_update_multiple_delegates(client, delegates):
    yuan, sun, _ = delegates
    res = client.patch(
        "/api/delegates/scores",
        json={
            "updates": [
                {"character_id": yuan.id, "military": 3.5},
                {"character_id": sun.id, "reputation": 4.0, "economics": 2.0},
            ],
            "reason": "Battle of Wuchang",
        },
    )
    assert res.status_code == 200
    by_id = {d["id"]: d for d in res.json()}
    assert by_id[yuan.id]["military"] == 3.5
    assert by_id[yuan.id]["reputation"] == 4.0  # untouched
    assert by_id[sun.id]["reputation"] == 4.0
    assert by_id[sun.id]["economics"] == 2.0


def test_scores_must_be_on_0_to_5_scale(client, delegates):
    res = client.patch(
        "/api/delegates/scores", json={"updates": [{"character_id": delegates[0].id, "military": 6}]}
    )
    assert res.status_code == 422


def test_unknown_delegate_404(client, delegates):
    res = client.patch("/api/delegates/scores", json={"updates": [{"character_id": 999, "military": 1}]})
    assert res.status_code == 404


def test_profile_notes_and_colour(client, delegates):
    res = client.patch(
        f"/api/delegates/{delegates[0].id}", json={"color": "#8b2e2e", "staff_notes": "Wants the throne."}
    )
    assert res.status_code == 200
    assert res.json()["color"] == "#8b2e2e"
    assert res.json()["staff_notes"] == "Wants the throne."
    assert client.patch(f"/api/delegates/{delegates[0].id}", json={"color": "red"}).status_code == 422


def test_calculate_single_delegate(client, delegates):
    yuan = delegates[0]  # 4, 3, 5 → ∛(1.6 × 1.2 × 2) ≈ 1.566
    res = client.post("/api/calculator/efficiency", json={"character_ids": [yuan.id]})
    body = res.json()
    assert body["efficiency"] == pytest.approx(1.566, abs=1e-3)
    assert body["band"]["key"] == "benefits"
    assert body["band"]["tips"]
    assert body["indicators"] == ["reputation", "economics", "military"]


def test_calculate_group_averages(client, delegates):
    yuan, sun, _ = delegates  # ≈1.566 and ∛(2 × 0.6 × 0.4) ≈ 0.783
    res = client.post("/api/calculator/efficiency", json={"character_ids": [yuan.id, sun.id]})
    body = res.json()
    assert body["efficiency"] == pytest.approx((1.566 + 0.783) / 2, abs=1e-3)
    assert [d["efficiency"] for d in body["delegates"]] == [
        pytest.approx(1.566, abs=1e-3),
        pytest.approx(0.783, abs=1e-3),
    ]


def test_calculate_with_chosen_indicators(client, delegates):
    zhang = delegates[2]  # reputation 1 → 0.4
    res = client.post(
        "/api/calculator/efficiency", json={"character_ids": [zhang.id], "indicators": ["reputation"]}
    )
    assert res.json()["efficiency"] == pytest.approx(0.4)
    assert res.json()["band"]["tone"] == "bad"


def test_calculate_does_not_change_state(client, delegates):
    client.post("/api/calculator/efficiency", json={"character_ids": [delegates[0].id]})
    assert client.get("/api/history").json() == []
    assert client.get("/api/delegates").json()[0]["published_efficiency"] is None


def test_invalid_indicator(client, delegates):
    res = client.post(
        "/api/calculator/efficiency", json={"character_ids": [delegates[0].id], "indicators": ["luck"]}
    )
    assert res.status_code == 422


def test_publish_sends_one_delegates_rating_to_map(client, delegates):
    yuan = delegates[0]
    res = client.post("/api/calculator/publish", json={"character_ids": [yuan.id]})
    assert res.status_code == 200
    state = client.get("/api/map").json()
    published = {d["id"]: d["published_efficiency"] for d in state["delegates"]}
    assert published[yuan.id] == pytest.approx(1.566, abs=1e-3)


def test_publish_sends_group_average_to_each_delegate(client, delegates):
    yuan, sun, _ = delegates
    res = client.post("/api/calculator/publish", json={"character_ids": [yuan.id, sun.id]})
    assert res.status_code == 200
    state = client.get("/api/map").json()
    published = {d["id"]: d["published_efficiency"] for d in state["delegates"]}
    assert published[yuan.id] == pytest.approx(1.175, abs=1e-3)
    assert published[sun.id] == pytest.approx(1.175, abs=1e-3)


def test_presets(client, delegates):
    ids = [delegates[0].id, delegates[2].id]
    res = client.post("/api/calculator/presets", json={"name": "Northern clique", "character_ids": ids})
    assert res.status_code == 201
    assert client.post(
        "/api/calculator/presets", json={"name": "Northern clique", "character_ids": ids}
    ).status_code == 409
    [preset] = client.get("/api/calculator/presets").json()
    assert preset["character_ids"] == ids
    assert client.delete(f"/api/calculator/presets/{preset['id']}").status_code == 204
    assert client.get("/api/calculator/presets").json() == []
