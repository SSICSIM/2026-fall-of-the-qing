"""The 23 characters of the character guide, with their clique colour and
the provinces they start in (the guide's 1936 map).

Characters in one clique share its coloured region. The Federalists are the
exception: Tang Jiyao holds Yunnan alone while the other three share
Liangguang (Guangdong and Guangxi). Guizhou is split between the Hunan and
Yunnan administrations (background guide, "Border Disputes"). Tibet starts
unclaimed, and Johnston's legation cities are cities, not provinces.

Where the map is hard to read, the guides' text decides:
- Shandong is Left-KMT: they won "both the core five provinces and
  Shandong" (background guide, "The Second Qing Collapse").
- Shaanxi is Zhili: Feng Yuxiang holds only Shanxi, "never controlling vast
  swathes of territory" (character guide), and the Ma Clique's land is
  Gansu, Qinghai, Ningxia and Suiyuan.
- Inner Mongolia is Ma Hongkui's: the Ma Clique "controls the majority" of
  it and Mongolia only claims it (background guide, "Border Disputes").
  Ungern-Sternberg's occupied strip was taken from the Fengtian Clique.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.crisis_note import Character, Faction
from app.services.provinces import ensure_provinces

# Clique colours, sampled from the Character Guide legend.
ZHILI = "#5f6378"
GUOMINJUN = "#2d6240"
MA_CLIQUE = "#67607f"
XINJIANG = "#e6b754"
MONGOLIA = "#6b8e2a"
HUNAN = "#4f88e0"
SICHUAN = "#9b7443"
FEDERALIST = "#965a7c"
FENGTIAN = "#c0721f"
LEFT_KMT = "#dc2f1f"

ZHILI_LAND = ("zhili", "henan", "hubei", "shaanxi")
FENGTIAN_LAND = ("fengtian", "jilin", "heilongjiang", "rehe")
KMT_LAND = ("jiangsu", "anhui", "zhejiang", "jiangxi", "fujian", "shandong")
LIANGGUANG = ("guangdong", "guangxi")


# The guide's cliques: faction name -> colour. Characters of one colour in
# the Character Guide legend share a faction.
FACTIONS: dict[str, str] = {
    "Zhili": ZHILI,
    "Guominjun": GUOMINJUN,
    "Ma Clique": MA_CLIQUE,
    "Xinjiang Clique": XINJIANG,
    "Mongolia": MONGOLIA,
    "Hunan Clique": HUNAN,
    "Sichuan Clique": SICHUAN,
    "Federalists": FEDERALIST,
    "Fengtian": FENGTIAN,
    "Left-KMT": LEFT_KMT,
}
FACTION_OF_COLOR = {color: name for name, color in FACTIONS.items()}

# Where the guides place a character, when it isn't their clique's first
# province: Li Zongren leads the Guangxi Clique; Song Qingling's PAC holds
# the MinGan (Fujian-Jiangxi) area.
HOMES: dict[str, str] = {
    "Li Zongren": "guangxi",
    "Song Qingling": "fujian",
}

# Johnston holds cities, not provinces, so the map's province-based
# auto-placement can't place him; the seed puts his pin on Shanghai, the
# first of the Legation Cities the Character Guide names. Map units, matching
# Shanghai in frontend/lib/map/qingGeometry.json (a frontend test checks).
LEGATION_PIN = (822.0, 476.0)


@dataclass(frozen=True)
class RosterEntry:
    name: str
    title: str
    color: str | None
    provinces: tuple[str, ...]

    @property
    def home(self) -> str | None:
        """The province they're based in: the clique's seat unless the
        guide places them elsewhere."""
        return HOMES.get(self.name, self.provinces[0] if self.provinces else None)

    @property
    def faction(self) -> str | None:
        """The clique this character belongs to; Johnston has none."""
        return FACTION_OF_COLOR.get(self.color) if self.color else None


ROSTER: tuple[RosterEntry, ...] = (
    RosterEntry("Wu Peifu", "Jade Marshal", ZHILI, ZHILI_LAND),
    RosterEntry("Cao Kun", "The Old Guard", ZHILI, ZHILI_LAND),
    RosterEntry("Sun Chuanfang", "The Smiling Tiger", ZHILI, ZHILI_LAND),
    RosterEntry("Aisin Gioro Puyi", "The Emperor without Power", ZHILI, ZHILI_LAND),
    RosterEntry("Feng Yuxiang", "The Christian General", GUOMINJUN, ("shanxi",)),
    RosterEntry("Ma Hongkui", "The Landlord", MA_CLIQUE, ("gansu", "qinghai", "inner_mongolia")),
    RosterEntry("Ma Shaowu", "The Xinjiang Balancer", XINJIANG, ("xinjiang",)),
    RosterEntry("Roman von Ungern-Sternberg", "The Mad Baron", MONGOLIA, ("mongolia",)),
    RosterEntry("Friedlich Zhenya-Isao Johnston", "The International Broker", None, ()),
    RosterEntry("Zhao Hengti", "Protector of Democracy", HUNAN, ("hunan", "guizhou")),
    RosterEntry("Yang Sen", "The Sichuan Survivor", SICHUAN, ("sichuan",)),
    RosterEntry("Chen Jiongming", "The Federalist Republican", FEDERALIST, LIANGGUANG),
    RosterEntry("Tang Jiyao", "The Yunnan Elder", FEDERALIST, ("yunnan", "guizhou")),
    RosterEntry("Li Zongren", "The Guangxi Modernizer", FEDERALIST, LIANGGUANG),
    RosterEntry("Chen Lianbo", "The Merchant Warlord", FEDERALIST, LIANGGUANG),
    RosterEntry("Zhang Zuolin", "The Old Marshal", FENGTIAN, FENGTIAN_LAND),
    RosterEntry("Shigeru Honjō", "The Pragmatic Concordia Chair", FENGTIAN, FENGTIAN_LAND),
    RosterEntry("Zhang Xueliang", "The Young Marshal", FENGTIAN, FENGTIAN_LAND),
    RosterEntry("Cao Rulin", "The Renegade", FENGTIAN, FENGTIAN_LAND),
    RosterEntry("Wang Jingwei", "The Revolutionary Chairman", LEFT_KMT, KMT_LAND),
    RosterEntry("Song Qingling", "Madame Sun", LEFT_KMT, KMT_LAND),
    RosterEntry("Sun Fo", "The Prodigal Sun", LEFT_KMT, KMT_LAND),
    RosterEntry("Hu Hanmin", "The Last Revolutionary", LEFT_KMT, KMT_LAND),
)


def starting_holders() -> dict[str, list[str]]:
    """Province id -> names of everyone who starts there. The first name is
    the controller (the first roster entry to list the province, except
    Guangxi, which goes to Li Zongren's Guangxi Clique)."""
    holders: dict[str, list[str]] = {}
    for entry in ROSTER:
        for pid in entry.provinces:
            holders.setdefault(pid, []).append(entry.name)
    guangxi = holders["guangxi"]
    guangxi.insert(0, guangxi.pop(guangxi.index("Li Zongren")))
    return holders


def seed_roster(db: Session, reset_map: bool = False) -> list[Character]:
    """Create the guide's factions, add any roster characters that are
    missing, put each in their faction, and set the starting map. Provinces that
    already have a controller are left alone unless reset_map is True."""
    ensure_provinces(db)
    factions = {f.name: f for f in db.query(Faction).all()}
    for name, color in FACTIONS.items():
        faction = factions.get(name)
        if faction is None:
            faction = Faction(name=name)
            db.add(faction)
            factions[name] = faction
        faction.color = color
    db.flush()

    by_name = {c.name: c for c in db.query(Character).all()}
    for entry in ROSTER:
        character = by_name.get(entry.name)
        if character is None:
            character = Character(name=entry.name)
            db.add(character)
            by_name[entry.name] = character
        if entry.faction is not None:
            # Members take the faction's colour; drop any colour of their own.
            character.faction_id = factions[entry.faction].id
            character.color = None
        elif not entry.provinces and character.x is None:
            character.x, character.y = LEGATION_PIN
        if entry.home and (character.home_province_id is None or reset_map):
            character.home_province_id = entry.home
    db.flush()

    holders = starting_holders()
    for province in ensure_provinces(db):
        if province.controller_id is not None and not reset_map:
            continue
        ids = [by_name[name].id for name in holders.get(province.id, [])]
        province.controller_id = ids[0] if ids else None
        province.co_holder_ids = ids[1:]
        if reset_map:
            province.occupier_id = None
            province.contested_by_id = None
    db.commit()
    return [by_name[entry.name] for entry in ROSTER]
