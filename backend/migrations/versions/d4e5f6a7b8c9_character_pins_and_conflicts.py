"""character_pins_and_conflicts

Character pin positions on the map, conflicts between characters, and a
MOVE kind in the undo history.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-10-07 22:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("characters", sa.Column("x", sa.Float(), nullable=True))
    op.add_column("characters", sa.Column("y", sa.Float(), nullable=True))
    op.execute("ALTER TYPE history_kind_enum ADD VALUE IF NOT EXISTS 'MOVE'")

    op.create_table(
        "conflicts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.Enum("ONGOING", "RESOLVED", name="conflict_status_enum"), nullable=False),
        sa.Column("winner_id", sa.Integer(), nullable=True),
        sa.Column("outcome_summary", sa.Text(), nullable=True),
        sa.Column("crisis_note_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["winner_id"], ["characters.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["crisis_note_id"], ["crisis_notes.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "conflict_parties",
        sa.Column("conflict_id", sa.Integer(), nullable=False),
        sa.Column("character_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["conflict_id"], ["conflicts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["character_id"], ["characters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("conflict_id", "character_id"),
    )


def downgrade() -> None:
    op.drop_table("conflict_parties")
    op.drop_table("conflicts")
    sa.Enum(name="conflict_status_enum").drop(op.get_bind(), checkfirst=True)
    # Postgres can't drop a single enum value; MOVE batches are removed and
    # the type is left with the extra (unused) value.
    op.execute("DELETE FROM history_batches WHERE kind = 'MOVE'")
    op.drop_column("characters", "y")
    op.drop_column("characters", "x")
