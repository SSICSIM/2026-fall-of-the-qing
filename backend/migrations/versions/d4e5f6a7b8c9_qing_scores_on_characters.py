"""qing_scores_on_characters

Moves each delegate's indicators, notes and published efficiency onto the
``characters`` table, copying existing data across, and drops the now redundant
``delegate_indicators`` and ``published_scores`` tables and the unused
``efficiency_settings.default_value`` column.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-10-05 15:00:00.000000

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
    for col in ("legitimacy", "military", "economics"):
        op.add_column(
            "characters",
            sa.Column(col, sa.Float(), nullable=False, server_default=sa.text("2.5")),
        )
    op.add_column("characters", sa.Column("notes", sa.Text(), nullable=True))
    op.add_column("characters", sa.Column("published_efficiency", sa.Float(), nullable=True))

    # Keep any data entered while these lived in their own tables.
    op.execute(
        """
        UPDATE characters AS c
        SET legitimacy = di.legitimacy,
            military = di.military,
            economics = di.economics,
            notes = di.notes
        FROM delegate_indicators AS di
        WHERE di.character_id = c.id
        """
    )
    op.execute(
        """
        UPDATE characters AS c
        SET published_efficiency = ps.efficiency
        FROM published_scores AS ps
        WHERE ps.character_id = c.id
        """
    )

    op.drop_table("published_scores")
    op.drop_table("delegate_indicators")
    op.drop_column("efficiency_settings", "default_value")


def downgrade() -> None:
    op.add_column(
        "efficiency_settings",
        sa.Column("default_value", sa.Float(), nullable=False, server_default=sa.text("2.5")),
    )
    op.alter_column("efficiency_settings", "default_value", server_default=None)

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
        "published_scores",
        sa.Column("character_id", sa.Integer(), nullable=False),
        sa.Column("efficiency", sa.Float(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["character_id"], ["characters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("character_id"),
    )
    op.execute(
        """
        INSERT INTO delegate_indicators (character_id, legitimacy, military, economics, notes)
        SELECT id, legitimacy, military, economics, notes FROM characters
        """
    )
    op.execute(
        """
        INSERT INTO published_scores (character_id, efficiency)
        SELECT id, published_efficiency FROM characters WHERE published_efficiency IS NOT NULL
        """
    )

    op.drop_column("characters", "published_efficiency")
    op.drop_column("characters", "notes")
    for col in ("economics", "military", "legitimacy"):
        op.drop_column("characters", col)
