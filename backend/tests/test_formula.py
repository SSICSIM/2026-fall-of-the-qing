from __future__ import annotations

TWO_BANDS = {
    "midpoint": 2,
    "bands": [
        {"label": "Setback", "tone": "bad", "min_rating": 0, "tips": ["Morale loss"]},
        {"label": "Success", "tone": "good", "min_rating": 1.2, "tips": ["Wins battle"]},
    ],
}


def test_defaults_are_the_prd(client):
    body = client.get("/api/calculator/formula").json()
    assert body["is_default"] is True
    assert body["midpoint"] == 2.5
    assert [b["min_rating"] for b in body["bands"]] == [0, 0.5, 1.5]


def test_edit_formula_changes_ratings(client, delegates):
    yuan = delegates[0]  # 4, 3, 5
    res = client.put("/api/calculator/formula", json=TWO_BANDS)
    assert res.status_code == 200 and res.json()["is_default"] is False
    assert res.json()["bands"][1]["key"] == "success"
    body = client.post("/api/calculator/efficiency", json={"character_ids": [yuan.id]}).json()
    # cbrt(2 * 1.5 * 2.5) = cbrt(7.5)
    assert body["efficiency"] == round(7.5 ** (1 / 3), 3)
    assert body["band"]["label"] == "Success"


def test_publish_uses_edited_formula(client, delegates):
    yuan = delegates[0]
    client.put("/api/calculator/formula", json=TWO_BANDS)
    [published] = client.post("/api/calculator/publish", json={"character_ids": [yuan.id]}).json()
    assert published["published_efficiency"] == round(7.5 ** (1 / 3), 3)


def test_reset_formula(client):
    client.put("/api/calculator/formula", json=TWO_BANDS)
    body = client.delete("/api/calculator/formula").json()
    assert body["is_default"] is True
    assert client.get("/api/calculator/formula").json()["midpoint"] == 2.5


def test_bands_must_start_at_zero_and_rise(client):
    bad_start = {**TWO_BANDS, "bands": [{**TWO_BANDS["bands"][0], "min_rating": 0.1}]}
    assert client.put("/api/calculator/formula", json=bad_start).status_code == 422
    flat = {**TWO_BANDS, "bands": [TWO_BANDS["bands"][0], {**TWO_BANDS["bands"][1], "min_rating": 0}]}
    assert client.put("/api/calculator/formula", json=flat).status_code == 422
    assert client.put("/api/calculator/formula", json={**TWO_BANDS, "midpoint": 0}).status_code == 422
