from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.config import settings

_PROD = os.getenv("ENVIRONMENT", "development") == "production"


def create_app() -> FastAPI:
    app = FastAPI(
        title="Base Mechanics API",
        version="0.1.0",
        openapi_url=None if _PROD else "/openapi.json",
        docs_url=None if _PROD else "/docs",
        redoc_url=None if _PROD else "/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router)

    # Unauthenticated liveness probe for Render's health check and the
    # conference keep-alive pinger. Deliberately outside api_router (which
    # requires the admin token) and doesn't touch the database.
    @app.get("/healthz", include_in_schema=False)
    def healthz() -> dict[str, bool]:
        return {"ok": True}

    return app


app = create_app()
