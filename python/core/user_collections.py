"""User collections: virtual lists of library files (not disk folders)."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

COLLECTIONS_FILENAME = ".Fieldy-collections.json"
RESERVED_COLLECTION_NAMES = frozenset(
    {"Recently added", "Starred", "Favorites", "Libraries", "Folders", "Mixed"}
)


def collections_file_path(library_root: Path) -> Path:
    return Path(library_root) / COLLECTIONS_FILENAME


def normalize_collection_name(name: str) -> str:
    cleaned = (name or "").strip()
    if not cleaned or cleaned in {".", ".."} or "/" in cleaned or "\\" in cleaned:
        raise ValueError("collection name must be a single line without path separators")
    if cleaned in RESERVED_COLLECTION_NAMES:
        raise ValueError(f"collection name is reserved: {cleaned}")
    return cleaned[:80]


def load_collections(library_root: Path) -> list[dict[str, object]]:
    path = collections_file_path(library_root)
    if not path.is_file():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    entries = raw.get("collections") if isinstance(raw, dict) else None
    if not isinstance(entries, list):
        return []
    out: list[dict[str, object]] = []
    seen_ids: set[str] = set()
    for item in entries:
        if not isinstance(item, dict):
            continue
        cid = str(item.get("id") or "").strip()
        name = str(item.get("name") or "").strip()
        if not cid or cid in seen_ids or not name:
            continue
        paths: list[str] = []
        path_seen: set[str] = set()
        for entry in item.get("paths") or []:
            value = entry.get("path") if isinstance(entry, dict) else entry
            if not isinstance(value, str) or not value.strip():
                continue
            key = str(Path(value).expanduser())
            if key in path_seen:
                continue
            path_seen.add(key)
            paths.append(key)
        seen_ids.add(cid)
        out.append({"id": cid, "name": name, "paths": paths})
    return out


def save_collections(library_root: Path, collections: list[dict[str, object]]) -> None:
    payload = {
        "collections": [
            {
                "id": item["id"],
                "name": item["name"],
                "paths": [{"path": p} for p in item.get("paths") or []],
            }
            for item in collections
        ]
    }
    collections_file_path(library_root).write_text(
        json.dumps(payload, indent=2) + "\n", encoding="utf-8"
    )


def create_collection(
    library_root: Path, name: str, collection_id: str | None = None
) -> dict[str, str]:
    root = Path(library_root).expanduser().resolve()
    cleaned = normalize_collection_name(name)
    collections = load_collections(root)
    cid = (collection_id or "").strip() or uuid.uuid4().hex
    for item in collections:
        if item["id"] == cid:
            item["name"] = cleaned
            save_collections(root, collections)
            return {"id": cid, "name": cleaned}
    collections.append({"id": cid, "name": cleaned, "paths": []})
    save_collections(root, collections)
    return {"id": cid, "name": cleaned}


def add_to_collection(library_root: Path, collection_id: str, path: str) -> dict[str, object]:
    root = Path(library_root).expanduser().resolve()
    resolved = str(Path(path).expanduser().resolve())
    collections = load_collections(root)
    found = None
    for item in collections:
        if item["id"] == collection_id:
            found = item
            break
    if found is None:
        raise ValueError("collection not found")
    paths = [str(Path(p).expanduser().resolve()) for p in found.get("paths") or []]
    if resolved not in paths:
        paths.append(resolved)
    found["paths"] = paths
    save_collections(root, collections)
    return {"id": collection_id, "path": resolved}


def remove_from_collection(
    library_root: Path, collection_id: str, path: str
) -> dict[str, object]:
    root = Path(library_root).expanduser().resolve()
    resolved = str(Path(path).expanduser().resolve())
    collections = load_collections(root)
    found = None
    for item in collections:
        if item["id"] == collection_id:
            found = item
            break
    if found is None:
        raise ValueError("collection not found")
    paths = [str(Path(p).expanduser().resolve()) for p in found.get("paths") or []]
    found["paths"] = [item for item in paths if item != resolved]
    save_collections(root, collections)
    return {"id": collection_id, "path": resolved}


def delete_collection(library_root: Path, collection_id: str) -> None:
    root = Path(library_root).expanduser().resolve()
    collections = load_collections(root)
    kept = [item for item in collections if item["id"] != collection_id]
    if len(kept) == len(collections):
        raise ValueError("collection not found")
    save_collections(root, kept)


def remap_collection_path(library_root: Path, old_path: str, new_path: str) -> None:
    old = str(Path(old_path).expanduser().resolve())
    new = str(Path(new_path).expanduser().resolve())
    if old == new:
        return
    collections = load_collections(library_root)
    changed = False
    for item in collections:
        paths = [str(Path(p).expanduser().resolve()) for p in item.get("paths") or []]
        if old not in paths:
            continue
        item["paths"] = [new if p == old else p for p in paths]
        changed = True
    if changed:
        save_collections(library_root, collections)


def remove_collection_path(library_root: Path, path: str) -> None:
    gone = str(Path(path).expanduser().resolve())
    collections = load_collections(library_root)
    changed = False
    for item in collections:
        paths = [str(Path(p).expanduser().resolve()) for p in item.get("paths") or []]
        kept = [p for p in paths if p != gone]
        if kept != paths:
            item["paths"] = kept
            changed = True
    if changed:
        save_collections(library_root, collections)


def prune_collections(
    library_root: Path, existing_paths: set[str]
) -> list[dict[str, object]]:
    existing_resolved = {str(Path(p).expanduser().resolve()) for p in existing_paths}
    collections = load_collections(library_root)
    changed = False
    for item in collections:
        loaded = [str(Path(p).expanduser().resolve()) for p in item.get("paths") or []]
        kept: list[str] = []
        seen: set[str] = set()
        for resolved in loaded:
            if resolved in existing_resolved and resolved not in seen:
                seen.add(resolved)
                kept.append(resolved)
        if kept != loaded:
            item["paths"] = kept
            changed = True
    if changed:
        save_collections(library_root, collections)
    return collections
