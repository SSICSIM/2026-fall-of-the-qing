from __future__ import annotations

import io
import json

import openpyxl
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.factions import require_faction
from app.database import get_db
from app.models.crisis_note import Character
from app.models.war_room import HistoryKind, Province
from app.schemas import BulkUploadResult, CharacterCreate, CharacterResponse
from app.services.history import Recorder
from app.services.provinces import PROVINCE_IDS, add_holder, ensure_provinces

router = APIRouter(prefix="/characters", tags=["characters"])


@router.get("", response_model=list[CharacterResponse])
def list_characters(db: Session = Depends(get_db)) -> list[Character]:
    return db.query(Character).order_by(Character.name).all()


@router.post("", response_model=CharacterResponse, status_code=status.HTTP_201_CREATED)
def create_character(body: CharacterCreate, db: Session = Depends(get_db)) -> Character:
    existing = db.query(Character).filter(Character.name == body.name).first()
    if existing:
        raise HTTPException(status_code=409, detail="A character with that name already exists.")
    unknown = [pid for pid in body.province_ids if pid not in PROVINCE_IDS]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown province(s): {', '.join(unknown)}.")
    if (body.x is None) != (body.y is None):
        raise HTTPException(status_code=422, detail="Give both x and y, or neither.")
    require_faction(db, body.faction_id)
    if body.province_ids:
        ensure_provinces(db)
    character = Character(
        name=body.name,
        faction_id=body.faction_id,
        home_province_id=body.province_ids[0] if body.province_ids else None,
        x=round(body.x, 1) if body.x is not None else None,
        y=round(body.y, 1) if body.y is not None else None,
    )
    db.add(character)
    if body.province_ids:
        db.flush()
        provinces = {p.id: p for p in ensure_provinces(db)}
        recorder = Recorder(
            db,
            HistoryKind.PROVINCE_EDIT,
            summary=f"{body.name} added in " + ", ".join(dict.fromkeys(body.province_ids)),
        )
        for pid in dict.fromkeys(body.province_ids):
            add_holder(recorder, provinces[pid], character.id)
    try:
        db.commit()
    except IntegrityError:
        # Another request created the same name between our check and commit.
        db.rollback()
        raise HTTPException(status_code=409, detail="A character with that name already exists.")
    db.refresh(character)
    return character


@router.post("/bulk", response_model=BulkUploadResult)
async def bulk_upload_characters(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> BulkUploadResult:
    content = await file.read()
    names: list[str] = []

    filename = (file.filename or "").lower()
    if filename.endswith(".json"):
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            raise HTTPException(status_code=422, detail="That file is not valid JSON.")
        if isinstance(data, list):
            for item in data:
                if isinstance(item, str):
                    names.append(item)
                elif isinstance(item, dict) and "name" in item:
                    names.append(str(item["name"]))
    elif filename.endswith(".xlsx"):
        try:
            wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        except Exception:
            raise HTTPException(status_code=422, detail="That file is not a valid .xlsx workbook.")
        ws = wb.active
        if ws is not None:
            for row in ws.iter_rows(values_only=True):
                if row and row[0] and isinstance(row[0], str):
                    names.append(row[0].strip())
    else:
        raise HTTPException(status_code=422, detail="Only .json and .xlsx files are supported.")

    created = skipped = 0
    existing_names = {
        r[0] for r in db.query(Character.name).all()
    }
    for name in names:
        name = name.strip()
        if not name:
            continue
        if name in existing_names:
            skipped += 1
        else:
            db.add(Character(name=name))
            existing_names.add(name)
            created += 1

    try:
        db.commit()
    except IntegrityError:
        # Another request imported/created an overlapping name concurrently.
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Some of these characters were just added by someone else. Try again.",
        )
    return BulkUploadResult(created=created, skipped=skipped)


@router.delete("/{character_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_character(character_id: int, db: Session = Depends(get_db)) -> None:
    character = db.get(Character, character_id)
    if not character:
        raise HTTPException(status_code=404, detail="Character not found.")
    for province in db.query(Province).all():
        if character_id in province.co_holder_ids:
            province.co_holder_ids = [i for i in province.co_holder_ids if i != character_id]
    db.delete(character)
    db.commit()
