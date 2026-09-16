"""AudioSet relatedness: overlapping labels vs truly different events."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

from core.config import CLASS_MAP_PATH, REPO_ROOT

ONTOLOGY_PATH = REPO_ROOT / "config" / "audioset_ontology.json"

# AudioSet splits "nature water" and "liquid/pour" into two trees. Treat as one family.
_WATER_ID = "/m/0838f"
_LIQUID_ID = "/m/04k94"
# Quieter patches often win Silence / room-tone / hiss — not a second event.
_BACKGROUND_IDS = frozenset({
    "/m/028v0c",  # Silence
    "/t/dd00093",  # Acoustic environment
    "/m/096m7z",  # Noise
})


def _load_name_to_mid(path: Path = CLASS_MAP_PATH) -> dict[str, str]:
    mapping: dict[str, str] = {}
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            name = (row.get("display_name") or "").strip()
            mid = (row.get("mid") or "").strip()
            if name and mid:
                mapping[name] = mid
    return mapping


def _load_parents(path: Path = ONTOLOGY_PATH) -> tuple[dict[str, list[str]], frozenset[str]]:
    nodes = json.loads(path.read_text(encoding="utf-8"))
    parents: dict[str, list[str]] = defaultdict(list)
    ids: set[str] = set()
    children: set[str] = set()
    for node in nodes:
        nid = node["id"]
        ids.add(nid)
        for child in node.get("child_ids") or []:
            parents[child].append(nid)
            children.add(child)
    roots = frozenset(ids - children)
    return dict(parents), roots


_NAME_TO_MID = _load_name_to_mid()
_PARENTS, _ROOT_IDS = _load_parents()


def _lineage(mid: str) -> set[str]:
    found = {mid}
    stack = [mid]
    while stack:
        current = stack.pop()
        for parent in _PARENTS.get(current, ()):
            if parent not in found:
                found.add(parent)
                stack.append(parent)
    return found


@lru_cache(maxsize=4096)
def classes_related(name_a: str, name_b: str) -> bool:
    """True if labels are the same event family (Pour vs Water), not Speech vs Water."""
    if name_a == name_b:
        return True
    mid_a = _NAME_TO_MID.get(name_a)
    mid_b = _NAME_TO_MID.get(name_b)
    if not mid_a or not mid_b:
        return False
    line_a = _lineage(mid_a)
    line_b = _lineage(mid_b)
    if (line_a & line_b) - _ROOT_IDS:
        return True
    waterish_a = _WATER_ID in line_a or _LIQUID_ID in line_a
    waterish_b = _WATER_ID in line_b or _LIQUID_ID in line_b
    return waterish_a and waterish_b


def is_background_class(name: str) -> bool:
    """Silence, room tone, and generic noise — not a second foreground event."""
    mid = _NAME_TO_MID.get(name)
    if not mid:
        return name == "Silence"
    return bool(_lineage(mid) & _BACKGROUND_IDS)
