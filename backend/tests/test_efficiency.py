from __future__ import annotations

import pytest

from app.services import efficiency as eff

ALL = ["LEGITIMACY", "MILITARY", "ECONOMICS"]


def vals(l, m, e):
    return {"LEGITIMACY": l, "MILITARY": m, "ECONOMICS": e}


def test_average_delegate_is_one():
    assert eff.compute_efficiency(vals(2.5, 2.5, 2.5), ALL, 5.0) == 1.0


def test_all_fives_is_two():
    assert eff.compute_efficiency(vals(5, 5, 5), ALL, 5.0) == 2.0


def test_zero_indicator_is_zero():
    assert eff.compute_efficiency(vals(0, 5, 5), ALL, 5.0) == 0.0


def test_geometric_not_arithmetic():
    # cube root of (1 * 1 * 0.25) = 0.63; an arithmetic mean would give 0.75
    assert eff.compute_efficiency(vals(2.5, 2.5, 0.625), ALL, 5.0) == 0.63


def test_subset_uses_n_equal_to_selected():
    # military only: 4 / 2.5 = 1.6
    assert eff.compute_efficiency(vals(1, 4, 1), ["MILITARY"], 5.0) == 1.6
    # two indicators: sqrt((5/2.5) * (1.25/2.5)) = 1.0
    assert eff.compute_efficiency(vals(5, 1.25, 0), ["LEGITIMACY", "MILITARY"], 5.0) == 1.0


def test_requires_selection():
    with pytest.raises(eff.EfficiencyError):
        eff.compute_efficiency(vals(1, 1, 1), [], 5.0)


@pytest.mark.parametrize(
    "score,label",
    [
        (0.0, "Can give consequences"),
        (0.49, "Can give consequences"),
        (0.5, "Can give minor consequence"),
        (1.0, "Can give minor consequence"),
        (1.49, "Can give minor consequence"),
        (1.5, "Can give benefits"),
        (2.0, "Can give benefits"),
    ],
)
def test_bands(score, label):
    assert eff.interpret(score, eff.DEFAULT_BANDS)["label"] == label


def test_average_of_delegates():
    assert eff.average([1.0, 1.6]) == 1.3
