from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services.efficiency import (
    band_for,
    clamp_score,
    delegate_efficiency,
    group_efficiency,
    normalize_indicators,
)


def scores(r: float, e: float, m: float) -> SimpleNamespace:
    return SimpleNamespace(reputation=r, economics=e, military=m)


def test_average_delegate_is_one():
    assert delegate_efficiency(scores(2.5, 2.5, 2.5)) == pytest.approx(1.0)


def test_extremes():
    assert delegate_efficiency(scores(0, 0, 0)) == 0
    assert delegate_efficiency(scores(5, 5, 5)) == pytest.approx(2.0)


def test_mechanics_guide_example_military_action():
    # ∛((R/2.5)(E/2.5)(M/2.5))
    assert delegate_efficiency(scores(4, 3, 5)) == pytest.approx((1.6 * 1.2 * 2.0) ** (1 / 3))


def test_root_matches_number_of_indicators():
    d = scores(5, 2.5, 1.25)  # 2, 1, 0.5
    assert delegate_efficiency(d, ["reputation", "economics"]) == pytest.approx(2**0.5)
    assert delegate_efficiency(d) == pytest.approx(1.0)


def test_a_zero_indicator_sinks_the_rating():
    assert delegate_efficiency(scores(5, 0, 5)) == 0


def test_subset_of_indicators():
    d = scores(5, 0, 2.5)
    assert delegate_efficiency(d, ["reputation"]) == pytest.approx(2.0)
    assert delegate_efficiency(d, ["economics", "military"]) == 0


def test_empty_indicator_list_means_all():
    assert normalize_indicators([]) == ["reputation", "economics", "military"]
    assert normalize_indicators(None) == ["reputation", "economics", "military"]


def test_indicators_are_deduplicated_and_ordered():
    assert normalize_indicators(["military", "reputation", "military"]) == ["reputation", "military"]


def test_unknown_indicator_rejected():
    with pytest.raises(ValueError):
        normalize_indicators(["charisma"])


def test_group_is_mean_of_individuals():
    a, b = scores(5, 5, 5), scores(0, 0, 0)
    assert group_efficiency([a, b]) == pytest.approx(1.0)


def test_group_requires_someone():
    with pytest.raises(ValueError):
        group_efficiency([])


@pytest.mark.parametrize(
    ("rating", "key"),
    [
        (0.0, "consequences"),
        (0.49, "consequences"),
        (0.5, "minor"),
        (1.0, "minor"),
        (1.49, "minor"),
        (1.5, "benefits"),
        (2.0, "benefits"),
    ],
)
def test_bands_follow_guide_thresholds(rating, key):
    assert band_for(rating).key == key


def test_every_band_has_tips():
    for rating in (0, 1, 1.8):
        assert band_for(rating).tips


def test_clamp():
    assert clamp_score(-1) == 0
    assert clamp_score(7) == 5
    assert clamp_score(3.3) == 3.3
