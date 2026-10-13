from __future__ import annotations


def scores_of(client, character_id):
    return next(d for d in client.get("/api/delegates").json() if d["id"] == character_id)


def test_undo_reverses_last_score_edit(client, delegates):
    yuan = delegates[0]
    client.patch("/api/delegates/scores", json={"updates": [{"character_id": yuan.id, "military": 1}]})
    client.patch("/api/delegates/scores", json={"updates": [{"character_id": yuan.id, "military": 2}]})

    res = client.post("/api/history/undo")
    assert res.status_code == 200
    assert res.json()["reverted"] is True
    assert scores_of(client, yuan.id)["military"] == 1

    client.post("/api/history/undo")
    assert scores_of(client, yuan.id)["military"] == 5


def test_undo_reverses_publish(client, delegates):
    client.post("/api/calculator/publish", json={"character_ids": [delegates[0].id]})
    client.post("/api/history/undo")
    assert scores_of(client, delegates[0].id)["published_efficiency"] is None


def test_nothing_to_undo(client, delegates):
    assert client.post("/api/history/undo").status_code == 409


def test_noop_edit_is_not_recorded(client, delegates):
    yuan = delegates[0]
    client.patch("/api/delegates/scores", json={"updates": [{"character_id": yuan.id, "military": 5}]})
    assert client.get("/api/history").json() == []


def test_history_records_attribution(client, delegates, directive):
    yuan = delegates[0]
    client.patch(
        "/api/delegates/scores",
        json={
            "updates": [{"character_id": yuan.id, "economics": 1}],
            "reason": "Paid the troops",
            "crisis_note_id": directive.id,
        },
    )
    [batch] = client.get("/api/history").json()
    assert batch["kind"] == "SCORE_EDIT"
    assert batch["reason"] == "Paid the troops"
    assert batch["crisis_note_id"] == directive.id
    assert "Yuan Shikai" in batch["summary"]
    [entry] = batch["entries"]
    assert entry == {
        "target_type": "character",
        "target_id": str(yuan.id),
        "field": "economics",
        "old_value": 3.0,
        "new_value": 1.0,
    }
