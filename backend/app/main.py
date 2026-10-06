from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.public import router as public_router
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

    # Delegate-facing read-only endpoints; intentionally not behind the admin token.
    app.include_router(public_router)

    return app


app = create_app()
