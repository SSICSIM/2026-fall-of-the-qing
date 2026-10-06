"""Efficiency calculation. Pure functions, no DB access.

Formula (from the director summary):

    efficiency = n-th root of  ( prod(relevant indicators) / 2.5^n )

i.e. the geometric mean of the relevant indicators, divided by 2.5. Indicators
are on a 0-5 scale, so 2.5 is "average" and gives an efficiency of 1.0; all
fives give 2.0; any zero gives 0. The divisor is ``scale_max / 2`` so it follows
the configured scale.

Backrooms get the final say on outcomes. The band tips are suggestions only.
"""
from __future__ import annotations

import math
from typing import Mapping, Sequence

from app.models.qing import Indicator

DEFAULT_SCALE_MAX = 5.0

# Thresholds from the mechanics guide: <0.5, around 1, 1.5+.
# [Confirm] exact edges between 0.5 and 1.5, and the column each outcome belongs to
# (the source table is laid out in three columns; this is our reading of it).
# Outcomes are listed in increasing severity, so use later ones for extreme scores.
DEFAULT_BANDS: list[dict] = [
    {
        "max": 0.5,
        "label": "Can give consequences",
        "tip": "Very low efficiency. Backrooms can apply consequences; use the more "
               "severe ones the further below 0.5 the score is.",
        "outcomes": ["Larger casualties", "Larger expenditure", "Loss of leadership",
                     "Loses battle"],
    },
    {
        "max": 1.5,
        "label": "Can give minor consequence",
        "tip": "Middling efficiency. At most a minor consequence is warranted.",
        "outcomes": ["More casualties", "Morale loss"],
    },
    {
        "max": None,  # 1.5 and above
        "label": "Can give benefits",
        "tip": "High efficiency. Backrooms can grant benefits; use the stronger ones "
               "for extreme scores.",
        "outcomes": ["Morale loss for the opposing side", "Seizes enemy equipment",
                     "Wins battle"],
    },
]


class EfficiencyError(ValueError):
    pass


def compute_efficiency(
    values: Mapping[str, float], selected: Sequence[str], scale_max: float
) -> float:
    """Geometric mean of the selected indicators divided by scale_max/2, 2 dp."""
    if not selected:
        raise EfficiencyError("Select at least one indicator.")
    if scale_max <= 0:
        raise EfficiencyError("scale_max must be positive.")
    neutral = scale_max / 2
    n = len(selected)
    product = 1.0
    for ind in selected:
        v = values[ind]
        if v < 0:
            raise EfficiencyError("Indicators cannot be negative.")
        product *= v / neutral
    return round(product ** (1.0 / n), 2)


def interpret(score: float, bands: Sequence[Mapping]) -> dict:
    """First band whose ``max`` is greater than the score; ``max`` None catches the rest."""
    for band in bands:
        if band["max"] is None or score < band["max"]:
            return {
                "label": band["label"],
                "tip": band["tip"],
                "outcomes": list(band.get("outcomes", [])),
            }
    last = bands[-1]
    return {"label": last["label"], "tip": last["tip"], "outcomes": list(last.get("outcomes", []))}


def average(scores: Sequence[float]) -> float:
    if not scores:
        raise EfficiencyError("Select at least one delegate.")
    return round(sum(scores) / len(scores), 2)


assert math.isclose(compute_efficiency({"LEGITIMACY": 2.5, "MILITARY": 2.5, "ECONOMICS": 2.5},
                                       [i.value for i in Indicator], 5.0), 1.0)
