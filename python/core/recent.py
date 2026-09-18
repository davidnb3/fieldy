"""Persist recently ingested library files per libraryRoot (not a disk folder)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

RECENT_FILENAME = ".Fieldy-recent.json"
RECENT_CAP = 50


def recent_file_path(library_root: Path) -> Path:
    return Path(library_root) / RECENT_FILENAME


def is_under_library(library_root: Path, path: Path) -> bool:
    root = Path(library_root).expanduser().resolve()
    resolved = Path(path).expanduser().resolve()
    try:
        resolved.relative_to(root)
        return True
    except ValueError:
        return False


def load_recent_paths(library_root: Path) -> list[str]:
    path = recent_file_path(library_root)
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
        if len(out) >= RECENT_CAP:
            break
    return out


def save_recent_paths(library_root: Path, paths: list[str]) -> None:
    trimmed: list[str] = []
    seen: set[str] = set()
    for raw in paths:
        key = str(Path(raw).expanduser())
        if key in seen:
            continue
        seen.add(key)
        trimmed.append(key)
        if len(trimmed) >= RECENT_CAP:
            break
    payload = json.dumps({"paths": [{"path": p} for p in trimmed]}, indent=2) + "\n"
    recent_file_path(library_root).write_text(payload, encoding="utf-8")


def record_new_ingest(library_root: Path, jobs: list[dict[str, Any]]) -> None:
    """Prepend successful new drops (ok + movedTo). Skip reclassify of library files."""
    root = Path(library_root).expanduser().resolve()
    additions: list[str] = []
    for job in jobs:
        if not job.get("ok"):
            continue
        moved = job.get("movedTo")
        if not moved:
            continue
        original = str(job.get("path") or "").strip()
        if original and is_under_library(root, Path(original)):
            continue
        dest = Path(str(moved)).expanduser().resolve()
        if not is_under_library(root, dest):
            continue
        additions.append(str(dest))
    if not additions:
        return
    existing = load_recent_paths(root)
    save_recent_paths(root, list(reversed(additions)) + existing)


def remap_recent_path(library_root: Path, old_path: str, new_path: str) -> None:
    old = str(Path(old_path).expanduser().resolve())
    new = str(Path(new_path).expanduser().resolve())
    if old == new:
        return
    current = [str(Path(item).expanduser().resolve()) for item in load_recent_paths(library_root)]
    if old not in current:
        return
    if not is_under_library(library_root, Path(new)):
        save_recent_paths(library_root, [item for item in current if item != old])
        return
    save_recent_paths(library_root, [new if item == old else item for item in current])


def remove_recent_path(library_root: Path, path: str) -> None:
    gone = str(Path(path).expanduser().resolve())
    current = [str(Path(item).expanduser().resolve()) for item in load_recent_paths(library_root)]
    kept = [item for item in current if item != gone]
    if kept != current:
        save_recent_paths(library_root, kept)


def prune_recent_paths(library_root: Path, existing_paths: set[str]) -> list[str]:
    """Keep newest-first entries that still exist in the library listing."""
    existing_resolved = {str(Path(p).expanduser().resolve()) for p in existing_paths}
    loaded = load_recent_paths(library_root)
    loaded_resolved = [str(Path(p).expanduser().resolve()) for p in loaded]
    kept: list[str] = []
    seen: set[str] = set()
    for resolved in loaded_resolved:
        if resolved in existing_resolved and resolved not in seen:
            seen.add(resolved)
            kept.append(resolved)
    if kept != loaded_resolved:
        save_recent_paths(library_root, kept)
    return kept
