"""add_war_room_tables

Delegate indicator scores, province control, map annotations (freehand
lines and war pins), the undoable change history, and calculator presets.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-10-07 21:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("characters", sa.Column("reputation", sa.Float(), server_default="2.5", nullable=False))
    op.add_column("characters", sa.Column("economics", sa.Float(), server_default="2.5", nullable=False))
    op.add_column("characters", sa.Column("military", sa.Float(), server_default="2.5", nullable=False))
    op.add_column("characters", sa.Column("published_efficiency", sa.Float(), nullable=True))
    op.add_column("characters", sa.Column("color", sa.String(length=16), nullable=True))
    op.add_column("characters", sa.Column("staff_notes", sa.Text(), nullable=True))

    op.create_table(
        "provinces",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("controller_id", sa.Integer(), nullable=True),
        sa.Column("occupier_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["controller_id"], ["characters.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["occupier_id"], ["characters.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "map_annotations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.Enum("LINE", "PIN", name="annotation_kind_enum"), nullable=False),
        sa.Column("points", sa.JSON(), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=True),
        sa.Column("color", sa.String(length=16), nullable=True),
        sa.Column("dashed", sa.Boolean(), nullable=False),
        sa.Column("crisis_note_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["crisis_note_id"], ["crisis_notes.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "history_batches",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum("SCORE_EDIT", "PUBLISH", "INVASION", "PROVINCE_EDIT", name="history_kind_enum"),
            nullable=False,
        ),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("crisis_note_id", sa.Integer(), nullable=True),
        sa.Column("reverted", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["crisis_note_id"], ["crisis_notes.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "history_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column("target_type", sa.String(length=32), nullable=False),
        sa.Column("target_id", sa.String(length=64), nullable=False),
        sa.Column("field", sa.String(length=64), nullable=False),
        sa.Column("old_value", sa.JSON(), nullable=True),
        sa.Column("new_value", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["batch_id"], ["history_batches.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "calculator_presets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("character_ids", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )


def downgrade() -> None:
    op.drop_table("calculator_presets")
    op.drop_table("history_entries")
    op.drop_table("history_batches")
    op.drop_table("map_annotations")
    op.drop_table("provinces")
    sa.Enum(name="history_kind_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="annotation_kind_enum").drop(op.get_bind(), checkfirst=True)
    for col in ("staff_notes", "color", "published_efficiency", "military", "economics", "reputation"):
        op.drop_column("characters", col)
