"""calculator_settings

Editable efficiency formula parameters (divisor, thresholds, tips).

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-10-12 23:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "calculator_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("midpoint", sa.Float(), nullable=False),
        sa.Column("bands", sa.JSON(), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_table("calculator_settings")
