from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.calculator import router as calculator_router
from app.api.characters import router as characters_router
from app.api.conflicts import router as conflicts_router
from app.api.crisis_notes import router as crisis_notes_router
from app.api.crisis_periods import router as crisis_periods_router
from app.api.delegates import router as delegates_router
from app.api.factions import router as factions_router
from app.api.health import router as health_router
from app.api.history import router as history_router
from app.api.staff_notes import router as staff_notes_router
from app.api.sync import router as sync_router
from app.api.war_map import router as war_map_router
from app.auth import require_admin_token

api_router = APIRouter(prefix="/api", dependencies=[Depends(require_admin_token)])
api_router.include_router(health_router)
api_router.include_router(characters_router)
api_router.include_router(crisis_periods_router)
api_router.include_router(crisis_notes_router)
api_router.include_router(staff_notes_router)
api_router.include_router(delegates_router)
api_router.include_router(factions_router)
api_router.include_router(calculator_router)
api_router.include_router(history_router)
api_router.include_router(war_map_router)
api_router.include_router(conflicts_router)
api_router.include_router(sync_router)
