"""home_province

The province each character is based in.

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-10-13 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d0e1f2a3b4c5"
down_revision: Union[str, None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("characters", sa.Column("home_province_id", sa.String(64), nullable=True))
    op.create_foreign_key(
        "characters_home_province_id_fkey",
        "characters",
        "provinces",
        ["home_province_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("characters_home_province_id_fkey", "characters", type_="foreignkey")
    op.drop_column("characters", "home_province_id")
