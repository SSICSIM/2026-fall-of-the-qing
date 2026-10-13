"""Seed the 23 characters of the character guide and the 1936 starting map.

Adds any guide characters that are missing (matched by exact name), gives
each their clique colour, and sets who holds every province (see
app/services/roster.py). Provinces that already have a controller are kept;
pass --reset-map to overwrite all control, occupations and disputes.

Characters still on the default 2.5 / 2.5 / 2.5 scores get varied
placeholder scores and a published efficiency so the calculator and map
have numbers to show. Scores come from a fixed RNG seed, so re-running
gives the same numbers; scores the backrooms have already set are kept.

    docker compose exec backend python scripts/seed.py [--reset-map]
"""

from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.services.efficiency import INDICATORS, delegate_efficiency  # noqa: E402
from app.services.roster import seed_roster  # noqa: E402

RNG_SEED = 1911
DEFAULT_SCORE = 2.5


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--reset-map", action="store_true", help="overwrite existing province control"
    )
    args = parser.parse_args()

    rng = random.Random(RNG_SEED)
    db = SessionLocal()
    try:
        characters = seed_roster(db, reset_map=args.reset_map)

        for character in characters:
            if any(getattr(character, i) != DEFAULT_SCORE for i in INDICATORS):
                continue
            for indicator in INDICATORS:
                # Half-point steps across most of the 0-5 range; skip 0 so no
                # one starts with a rating sunk by a single indicator.
                setattr(character, indicator, rng.choice([x / 2 for x in range(1, 11)]))
            character.published_efficiency = round(delegate_efficiency(character), 3)
        db.commit()

        print(f"{'name':<32} {'rep':>4} {'eco':>4} {'mil':>4} {'eff':>6}")
        for c in characters:
            print(
                f"{c.name:<32} {c.reputation:>4} {c.economics:>4} {c.military:>4}"
                f" {c.published_efficiency if c.published_efficiency is not None else '—':>6}"
            )
    finally:
        db.close()


if __name__ == "__main__":
    main()
