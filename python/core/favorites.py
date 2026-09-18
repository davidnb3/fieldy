"""Persist favorite library files per libraryRoot (not a disk folder)."""

from __future__ import annotations

import json
from pathlib import Path

FAVORITES_FILENAME = ".Fieldy-favorites.json"


def favorites_file_path(library_root: Path) -> Path:
    return Path(library_root) / FAVORITES_FILENAME


def load_favorite_paths(library_root: Path) -> list[str]:
    path = favorites_file_path(library_root)
    if not path.is_file():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    entries = raw.get("paths") if isinstance(raw, dict) else None
    if not isinstance(entries, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in entries:
        value = item.get("path") if isinstance(item, dict) else item
        if not isinstance(value, str) or not value.strip():
            continue
        key = str(Path(value).expanduser())
        if key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


def save_favorite_paths(library_root: Path, paths: list[str]) -> None:
    trimmed: list[str] = []
    seen: set[str] = set()
    for raw in paths:
        key = str(Path(raw).expanduser())
        if key in seen:
            continue
        seen.add(key)
        trimmed.append(key)
    payload = json.dumps({"paths": [{"path": p} for p in trimmed]}, indent=2) + "\n"
    favorites_file_path(library_root).write_text(payload, encoding="utf-8")


def set_favorite(library_root: Path, path: str, favorite: bool) -> bool:
    root = Path(library_root).expanduser().resolve()
    resolved = str(Path(path).expanduser().resolve())
    current = [str(Path(item).expanduser().resolve()) for item in load_favorite_paths(root)]
    if favorite:
        if resolved not in current:
            current = [resolved] + current
    else:
        current = [item for item in current if item != resolved]
    save_favorite_paths(root, current)
    return favorite


def remap_favorite_path(library_root: Path, old_path: str, new_path: str) -> None:
    old = str(Path(old_path).expanduser().resolve())
    new = str(Path(new_path).expanduser().resolve())
    if old == new:
        return
    current = [str(Path(item).expanduser().resolve()) for item in load_favorite_paths(library_root)]
    if old not in current:
        return
    updated = [new if item == old else item for item in current]
    save_favorite_paths(library_root, updated)


def remove_favorite_path(library_root: Path, path: str) -> None:
    gone = str(Path(path).expanduser().resolve())
    current = [str(Path(item).expanduser().resolve()) for item in load_favorite_paths(library_root)]
    kept = [item for item in current if item != gone]
    if kept != current:
        save_favorite_paths(library_root, kept)


def prune_favorite_paths(library_root: Path, existing_paths: set[str]) -> list[str]:
    existing_resolved = {str(Path(p).expanduser().resolve()) for p in existing_paths}
    loaded = load_favorite_paths(library_root)
    loaded_resolved = [str(Path(p).expanduser().resolve()) for p in loaded]
    kept: list[str] = []
    seen: set[str] = set()
    for resolved in loaded_resolved:
        if resolved in existing_resolved and resolved not in seen:
            seen.add(resolved)
            kept.append(resolved)
    if kept != loaded_resolved:
        save_favorite_paths(library_root, kept)
    return kept
