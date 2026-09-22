"""Change libraryRoot: leave files in place, or move class folders to a new root."""

from __future__ import annotations

import shutil
from pathlib import Path

from core.audio_formats import AUDIO_SUFFIXES
from core.config import is_legal_destination
from core.favorites import load_favorite_paths, save_favorite_paths
from core.fs_ops import unique_dest
from core.recent import load_recent_paths, save_recent_paths
from core.user_collections import load_collections, save_collections


def relocate_library(old_root: str | Path, new_root: str | Path) -> dict[str, str]:
    """Move Mixed/class audio into new_root and remap stars, collections, and recents."""
    source = Path(old_root).expanduser().resolve()
    dest = Path(new_root).expanduser()
    if dest.exists() and not dest.is_dir():
        raise ValueError(f"libraryRoot is not a directory: {dest}")
    dest.mkdir(parents=True, exist_ok=True)
    dest = dest.resolve()
    if source == dest:
        return {}
    if _is_inside(dest, source) or _is_inside(source, dest):
        raise ValueError("new library folder cannot be inside the current one, or vice versa")
    if not source.is_dir():
        raise ValueError(f"libraryRoot is not a directory: {source}")

    old_favs = load_favorite_paths(source)
    old_recent = load_recent_paths(source)
    old_collections = load_collections(source)
    dest_favs = load_favorite_paths(dest) if (dest / ".Fieldy-favorites.json").is_file() else []
    dest_recent = load_recent_paths(dest) if (dest / ".Fieldy-recent.json").is_file() else []
    dest_collections = (
        load_collections(dest) if (dest / ".Fieldy-collections.json").is_file() else []
    )

    mapping = _move_library_audio(source, dest)
    remapped_favs = _remap_paths(old_favs, mapping)
    remapped_recent = _remap_paths(old_recent, mapping)
    save_favorite_paths(dest, _unique_join(remapped_favs, dest_favs))
    save_recent_paths(dest, _unique_join(remapped_recent, dest_recent))
    save_collections(dest, _merge_collections(dest_collections, old_collections, mapping))
    return mapping


def _move_library_audio(source: Path, dest: Path) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for folder in sorted(source.iterdir()):
        if not folder.is_dir() or not is_legal_destination(folder.name):
            continue
        dest_folder = dest / folder.name
        dest_folder.mkdir(parents=True, exist_ok=True)
        for child in sorted(folder.iterdir()):
            if not child.is_file() or child.suffix.lower() not in AUDIO_SUFFIXES:
                continue
            src = str(child.resolve())
            target = unique_dest(dest_folder, child.name)
            shutil.move(src, target)
            mapping[src] = str(Path(target).resolve())
        try:
            folder.rmdir()
        except OSError:
            pass
    return mapping


def _remap_paths(paths: list[str], mapping: dict[str, str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in paths:
        key = str(Path(raw).expanduser().resolve())
        mapped = mapping.get(key)
        if not mapped or mapped in seen:
            continue
        seen.add(mapped)
        out.append(mapped)
    return out


def _unique_join(first: list[str], second: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in first + second:
        key = str(Path(raw).expanduser().resolve())
        if key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


def _merge_collections(
    dest_collections: list[dict[str, object]],
    old_collections: list[dict[str, object]],
    mapping: dict[str, str],
) -> list[dict[str, object]]:
    dest_ids = {str(item["id"]) for item in dest_collections}
    merged = [
        {
            "id": item["id"],
            "name": item["name"],
            "paths": list(item.get("paths") or []),
        }
        for item in dest_collections
    ]
    for item in old_collections:
        remapped = {
            "id": item["id"],
            "name": item["name"],
            "paths": _remap_paths(list(item.get("paths") or []), mapping),
        }
        cid = str(remapped["id"])
        if cid in dest_ids:
            for existing in merged:
                if existing["id"] == cid:
                    existing["paths"] = _unique_join(
                        [str(p) for p in existing.get("paths") or []],
                        remapped["paths"],
                    )
                    break
            continue
        merged.append(remapped)
    return merged


def _is_inside(inner: Path, outer: Path) -> bool:
    try:
        inner.relative_to(outer)
        return inner != outer
    except ValueError:
        return False
