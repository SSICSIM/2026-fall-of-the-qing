from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.characters import router as characters_router
from app.api.crisis_notes import router as crisis_notes_router
from app.api.crisis_periods import router as crisis_periods_router
from app.api.health import router as health_router
from app.api.qing import router as qing_router
from app.api.staff_notes import router as staff_notes_router
from app.auth import require_admin_token

api_router = APIRouter(prefix="/api", dependencies=[Depends(require_admin_token)])
api_router.include_router(health_router)
api_router.include_router(characters_router)
api_router.include_router(crisis_periods_router)
api_router.include_router(crisis_notes_router)
api_router.include_router(staff_notes_router)
api_router.include_router(qing_router)
