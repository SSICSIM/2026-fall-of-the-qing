"""province_shapes

Lets staff redraw a province's border: an optional outline that replaces
the preset shape, plus a BORDER kind in the undo history.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-10-07 22:30:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE history_kind_enum ADD VALUE IF NOT EXISTS 'BORDER'")
    op.add_column("provinces", sa.Column("shape", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.execute("DELETE FROM history_batches WHERE kind = 'BORDER'")
    op.drop_column("provinces", "shape")
