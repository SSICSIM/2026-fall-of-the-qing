"""qing_indicators_and_calculator

Adds delegate indicators, efficiency settings, calculation runs, the published
map scores, delegate groups, and the reversible action log. Also adds an
optional home region to characters.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-10-05 12:00:00.000000

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
    op.add_column("characters", sa.Column("region", sa.String(length=255), nullable=True))

    op.create_table(
        "delegate_indicators",
        sa.Column("character_id", sa.Integer(), nullable=False),
        sa.Column("legitimacy", sa.Float(), nullable=False),
        sa.Column("military", sa.Float(), nullable=False),
        sa.Column("economics", sa.Float(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["character_id"], ["characters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("character_id"),
    )
    op.create_table(
        "delegate_groups",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("character_ids", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "efficiency_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scale_max", sa.Float(), nullable=False),
        sa.Column("default_value", sa.Float(), nullable=False),
        sa.Column("bands", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "calculation_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("character_ids", sa.JSON(), nullable=False),
        sa.Column("indicators", sa.JSON(), nullable=False),
        sa.Column("results", sa.JSON(), nullable=False),
        sa.Column("average", sa.Float(), nullable=False),
        sa.Column("band_label", sa.String(length=255), nullable=False),
        sa.Column("tip", sa.Text(), nullable=False),
        sa.Column("outcomes", sa.JSON(), nullable=False),
        sa.Column("status", sa.Enum("DRAFT", "PUBLISHED", "REVERTED", name="run_status_enum"), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "published_scores",
        sa.Column("character_id", sa.Integer(), nullable=False),
        sa.Column("efficiency", sa.Float(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["character_id"], ["characters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("character_id"),
    )
    op.create_table(
        "action_log",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.Enum("SCORE_EDIT", "PUBLISH", name="action_kind_enum"), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("reverted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("action_log")
    op.drop_table("published_scores")
    op.drop_table("calculation_runs")
    op.drop_table("efficiency_settings")
    op.drop_table("delegate_groups")
    op.drop_table("delegate_indicators")
    op.drop_column("characters", "region")
    sa.Enum(name="action_kind_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="run_status_enum").drop(op.get_bind(), checkfirst=True)
