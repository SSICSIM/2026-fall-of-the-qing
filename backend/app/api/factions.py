from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.crisis_note import Faction
from app.schemas import FactionCreate, FactionResponse, FactionUpdate

router = APIRouter(prefix="/factions", tags=["factions"])


def require_faction(db: Session, faction_id: int | None) -> None:
    if faction_id is not None and db.get(Faction, faction_id) is None:
        raise HTTPException(status_code=404, detail="Faction not found.")


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A faction with that name already exists.")


@router.get("", response_model=list[FactionResponse])
def list_factions(db: Session = Depends(get_db)) -> list[Faction]:
    return db.query(Faction).order_by(Faction.name).all()


@router.post("", response_model=FactionResponse, status_code=status.HTTP_201_CREATED)
def create_faction(body: FactionCreate, db: Session = Depends(get_db)) -> Faction:
    faction = Faction(name=body.name.strip(), color=body.color)
    db.add(faction)
    _commit(db)
    db.refresh(faction)
    return faction


@router.patch("/{faction_id}", response_model=FactionResponse)
def update_faction(faction_id: int, body: FactionUpdate, db: Session = Depends(get_db)) -> Faction:
    faction = db.get(Faction, faction_id)
    if faction is None:
        raise HTTPException(status_code=404, detail="Faction not found.")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(faction, field, value.strip() if field == "name" and value else value)
    _commit(db)
    db.refresh(faction)
    return faction


@router.delete("/{faction_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_faction(faction_id: int, db: Session = Depends(get_db)) -> None:
    """Remove a faction; its members stay, without a faction."""
    faction = db.get(Faction, faction_id)
    if faction is None:
        raise HTTPException(status_code=404, detail="Faction not found.")
    db.delete(faction)
    db.commit()
