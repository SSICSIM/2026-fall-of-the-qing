from __future__ import annotations

import io

import openpyxl


def xlsx(rows):
    wb = openpyxl.Workbook()
    for row in rows:
        wb.active.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def upload(client, rows):
    files = {"file": ("characters.xlsx", xlsx(rows), "application/octet-stream")}
    return client.post("/api/characters/bulk", files=files)


def by_name(client):
    return {d["name"]: d for d in client.get("/api/map").json()["delegates"]}


def holders(client, pid):
    p = next(p for p in client.get("/api/map").json()["provinces"] if p["id"] == pid)
    return [p["controller_id"], *p["co_holder_ids"]] if p["controller_id"] else []


def test_columns_set_home_province_and_ownership(client):
    res = upload(
        client,
        [
            ["Name", "Province", "Owns"],
            ["Yan Xishan", "Shanxi", "yes"],
            ["Feng Yuxiang", "inner mongolia", "no"],
            ["Wu Peifu", "Zhili", True],
            ["Cao Kun", "zhili", "x"],
            ["Puyi", None, None],
        ],
    )
    assert res.status_code == 200
    assert res.json() == {"created": 5, "skipped": 0, "unknown_provinces": []}
    chars = by_name(client)
    assert "Name" not in chars
    assert chars["Yan Xishan"]["home_province_id"] == "shanxi"
    assert chars["Feng Yuxiang"]["home_province_id"] == "inner_mongolia"
    assert chars["Puyi"]["home_province_id"] is None
    assert holders(client, "shanxi") == [chars["Yan Xishan"]["id"]]
    assert holders(client, "inner_mongolia") == []
    # The second owner shares the province.
    assert holders(client, "zhili") == [chars["Wu Peifu"]["id"], chars["Cao Kun"]["id"]]
    # One undo takes the whole import's holdings back.
    client.post("/api/history/undo", json={})
    assert holders(client, "zhili") == []


def test_unknown_province_is_reported(client):
    res = upload(client, [["Zhang Xun", "Atlantis", "yes"]])
    assert res.json() == {"created": 1, "skipped": 0, "unknown_provinces": ["Zhang Xun: Atlantis"]}
    assert by_name(client)["Zhang Xun"]["home_province_id"] is None


def test_json_accepts_province_and_owns(client):
    data = b'[{"name": "Yan Xishan", "province": "shanxi", "owns": true}, "Puyi"]'
    res = client.post("/api/characters/bulk", files={"file": ("c.json", data, "application/json")})
    assert res.json()["created"] == 2
    assert holders(client, "shanxi") == [by_name(client)["Yan Xishan"]["id"]]
