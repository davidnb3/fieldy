"""List {libraryRoot}: Mixed plus class folders that already exist on disk."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from core.config import assert_legal_destination, is_legal_destination
from core.favorites import prune_favorite_paths
from core.metadata import read_tags
from core.preprocess import audio_info
from core.recent import prune_recent_paths
from core.user_collections import prune_collections

AUDIO_SUFFIXES = {".wav", ".wave"}


def require_ready_config(config: dict[str, Any]) -> Path:
    if config.get("needsOnboarding"):
        raise ValueError("needsOnboarding: save_config with libraryRoot first")
    root = Path(config["libraryRoot"]).expanduser().resolve()
    if not root.is_dir():
        raise ValueError(f"libraryRoot is not a directory: {root}")
    return root


def resolve_library_file(config: dict[str, Any], path: str) -> Path:
    root = require_ready_config(config)
    resolved = Path(path).expanduser().resolve()
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise ValueError("path is outside libraryRoot") from exc
    if not resolved.is_file():
        raise FileNotFoundError(f"not a file: {path}")
    return resolved


def list_library(config: dict[str, Any]) -> dict[str, Any]:
    root = require_ready_config(config)
    mixed = root / "Mixed"
    mixed.mkdir(exist_ok=True)

    names = ["Mixed"]
    extra = sorted(
        p.name
        for p in root.iterdir()
        if p.is_dir() and p.name != "Mixed" and is_legal_destination(p.name)
    )
    names.extend(extra)

    folders = []
    files_by_path: dict[str, dict[str, Any]] = {}
    for name in names:
        folder = root / name
        files = []
        if folder.is_dir():
            for child in sorted(folder.iterdir()):
                if not child.is_file() or child.suffix.lower() not in AUDIO_SUFFIXES:
                    continue
                entry = _file_entry(child)
                files.append(entry)
                files_by_path[str(child.resolve())] = entry
        folders.append({"name": name, "files": files})
    recent_paths = prune_recent_paths(root, set(files_by_path))
    recently_added = [files_by_path[p] for p in recent_paths if p in files_by_path]
    favorite_paths = prune_favorite_paths(root, set(files_by_path))
    favorite_set = set(favorite_paths)
    for entry in files_by_path.values():
        resolved = str(Path(entry["path"]).expanduser().resolve())
        entry["favorite"] = resolved in favorite_set
    favorites = [files_by_path[p] for p in favorite_paths if p in files_by_path]
    collections = []
    for item in prune_collections(root, set(files_by_path)):
        files = [files_by_path[p] for p in item["paths"] if p in files_by_path]
        collections.append({"id": item["id"], "name": item["name"], "files": files})
    return {
        "libraryRoot": str(root),
        "folders": folders,
        "recentlyAdded": recently_added,
        "favorites": favorites,
        "collections": collections,
    }


def _file_entry(path: Path) -> dict[str, Any]:
    entry: dict[str, Any] = {"name": path.name, "path": str(path), "tags": []}
    try:
        entry["tags"] = read_tags(str(path))
    except Exception:
        entry["tags"] = []
    try:
        info = audio_info(str(path))
        entry["duration"] = info["duration"]
    except Exception:
        entry["duration"] = None
    return entry


def normalize_new_name(path: Path, new_name: str) -> str:
    name = new_name.strip()
    if not name or name in {".", ".."} or "/" in name or "\\" in name:
        raise ValueError("newName must be a basename without path separators")
    if Path(name).name != name:
        raise ValueError("newName must be a basename without path separators")
    if not Path(name).suffix and path.suffix:
        name = f"{name}{path.suffix}"
    return name


def move_library_file(config: dict[str, Any], src: str, dest_folder: str) -> str:
    from core.fs_ops import move_into_folder

    source = resolve_library_file(config, src)
    assert_legal_destination(dest_folder)
    dest_dir = require_ready_config(config) / dest_folder
    if source.parent.resolve() == dest_dir.resolve():
        return str(source)
    return move_into_folder(str(source), str(dest_dir))
