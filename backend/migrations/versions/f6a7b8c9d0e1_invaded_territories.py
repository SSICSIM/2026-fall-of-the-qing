"""invaded_territories

Areas taken in invasions (drawn by staff, so part of a province can change
hands) and contested provinces.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-10-07 23:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("provinces", sa.Column("contested_by_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "provinces_contested_by_id_fkey", "provinces", "characters", ["contested_by_id"], ["id"], ondelete="SET NULL"
    )
    op.create_table(
        "territories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("holder_id", sa.Integer(), nullable=False),
        sa.Column("defender_id", sa.Integer(), nullable=True),
        sa.Column("province_id", sa.String(length=64), nullable=True),
        sa.Column(
            "status",
            sa.Enum("ANNEXED", "OCCUPIED", "CONTESTED", name="territory_status_enum"),
            nullable=False,
        ),
        sa.Column("polygon", sa.JSON(), nullable=False),
        sa.Column("crisis_note_id", sa.Integer(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["holder_id"], ["characters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["defender_id"], ["characters.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["province_id"], ["provinces.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["crisis_note_id"], ["crisis_notes.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("territories")
    sa.Enum(name="territory_status_enum").drop(op.get_bind(), checkfirst=True)
    op.drop_constraint("provinces_contested_by_id_fkey", "provinces", type_="foreignkey")
    op.drop_column("provinces", "contested_by_id")
