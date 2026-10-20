from __future__ import annotations

from fastapi import APIRouter

from app.schemas import SyncResponse
from app.services.sync import current_revision

router = APIRouter(prefix="/sync", tags=["sync"])


@router.get("", response_model=SyncResponse)
def get_revision() -> SyncResponse:
    """Changes after every save; clients poll it to know when to refetch."""
    return SyncResponse(revision=current_revision())
