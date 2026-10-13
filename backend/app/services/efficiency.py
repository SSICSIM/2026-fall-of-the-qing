"""Efficiency rating from the 0-5 indicator scores in the mechanics guide.

    efficiency = ⁿ√( Π (indicator / 2.5) )   over the n chosen indicators

i.e. the geometric mean: a square root when two indicators are chosen, a
cube root for all three. Indicators are on a 0-5 scale, so dividing by 2.5
makes 1.0 an "average" delegate; the rating runs from 0 to 2, and a zero in
any chosen indicator sinks the whole action. When several delegates act
together the rating is the mean of their individual ratings.

The rating is multiplied by a force's absolute strength to compare sides,
and its band suggests consequences.

The divisor and the bands below are the PRD defaults; staff can change both
from the calculator (see app/services/formula.py).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Protocol

INDICATORS: tuple[str, ...] = ("reputation", "economics", "military")
SCORE_MIN = 0.0
SCORE_MAX = 5.0
SCORE_MIDPOINT = 2.5


class HasScores(Protocol):
    reputation: float
    economics: float
    military: float


@dataclass(frozen=True)
class Band:
    key: str
    label: str
    # "bad" | "neutral" | "good" — drives colour in the UI.
    tone: str
    min_rating: float
    tips: tuple[str, ...]


# The product requirement document's efficiency thresholds, worst to best.
# Consequences and benefits are listed in increasing severity; give high
# severity to extreme ratings.
BANDS: tuple[Band, ...] = (
    Band(
        key="consequences",
        label="Can give consequences",
        tone="bad",
        min_rating=0.0,
        tips=("Larger casualties", "Larger expenditure", "Loss of leadership", "Loses battle"),
    ),
    Band(
        key="minor",
        label="Can give minor consequence",
        tone="neutral",
        min_rating=0.5,
        tips=("More casualties", "Morale loss"),
    ),
    Band(
        key="benefits",
        label="Can give benefits",
        tone="good",
        min_rating=1.5,
        tips=("Morale loss for the opponent", "Seizes enemy equipment", "Wins battle"),
    ),
)


def band_for(rating: float, bands: tuple[Band, ...] = BANDS) -> Band:
    chosen = bands[0]
    for band in bands:
        if rating >= band.min_rating:
            chosen = band
    return chosen


def normalize_indicators(indicators: Iterable[str] | None) -> list[str]:
    """Validate and de-duplicate, keeping canonical order. Empty → all three."""
    if not indicators:
        return list(INDICATORS)
    chosen = set(indicators)
    unknown = chosen - set(INDICATORS)
    if unknown:
        raise ValueError(f"Unknown indicator(s): {', '.join(sorted(unknown))}")
    return [i for i in INDICATORS if i in chosen]


def delegate_efficiency(
    scores: HasScores, indicators: Iterable[str] | None = None, midpoint: float = SCORE_MIDPOINT
) -> float:
    chosen = normalize_indicators(indicators)
    product = 1.0
    for i in chosen:
        product *= getattr(scores, i) / midpoint
    return product ** (1 / len(chosen))


def group_efficiency(
    delegates: list[HasScores],
    indicators: Iterable[str] | None = None,
    midpoint: float = SCORE_MIDPOINT,
) -> float:
    if not delegates:
        raise ValueError("At least one delegate is required.")
    ratings = [delegate_efficiency(d, indicators, midpoint) for d in delegates]
    return sum(ratings) / len(ratings)


def clamp_score(value: float) -> float:
    return max(SCORE_MIN, min(SCORE_MAX, value))
