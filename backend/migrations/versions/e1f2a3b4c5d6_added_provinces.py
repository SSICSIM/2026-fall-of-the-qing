"""added_provinces

Provinces staff add on the map carry their own name.

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-10-19 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, None] = "d0e1f2a3b4c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("provinces", sa.Column("name", sa.String(64), nullable=True))
    op.add_column(
        "provinces", sa.Column("custom", sa.Boolean(), nullable=False, server_default=sa.false())
    )


def downgrade() -> None:
    op.execute("DELETE FROM provinces WHERE custom")
    op.drop_column("provinces", "custom")
    op.drop_column("provinces", "name")
