from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

from core.config import ConfigStore
from core.errors import inspect_library_root
from core.favorites import (
    load_favorite_paths,
    remap_favorite_path,
    remove_favorite_path,
    set_favorite,
)
from core.fs_ops import rename_file
from core.history import History, stash_deleted_file
from core.ingest import ingest_paths
from core.library import (
    list_library,
    move_library_file,
    normalize_new_name,
    require_ready_config,
    resolve_library_file,
)
from core.library_root import relocate_library
from core.playback import waveform_and_preview
from core.recent import is_under_library, remap_recent_path, remove_recent_path
from core.user_collections import (
    add_to_collection,
    create_collection,
    load_collections,
    remap_collection_path,
    remove_collection_path,
)

Handler = Callable[[dict[str, Any]], Any]
ProgressFn = Callable[[dict[str, Any]], None]


def _public_config(data: dict[str, Any]) -> dict[str, Any]:
    out = {key: value for key, value in data.items() if key != "libraryRootProblem"}
    if out.get("needsOnboarding"):
        return out
    problem = data.get("libraryRootProblem") or inspect_library_root(out.get("libraryRoot"))
    if problem:
        out["libraryRootProblem"] = problem
    return out


def _param_paths(params: dict[str, Any], *keys: str) -> list[str]:
    if "paths" in params and params.get("paths") is not None:
        raw = params.get("paths")
        if not isinstance(raw, list):
            raise ValueError("paths must be a list of file paths")
        return [str(item) for item in raw if str(item).strip()]
    for key in keys:
        value = params.get(key)
        if value:
            return [str(value)]
    return []


def build_handlers(
    store: ConfigStore | None = None,
    emit_progress: ProgressFn | None = None,
    classifier=None,
) -> dict[str, Handler]:
    cfg = store or ConfigStore()
    history = History()

    def _root():
        return require_ready_config(cfg.get())

    def _remap(old: str, new: str | None) -> None:
        root = _root()
        if new is None or not is_under_library(root, Path(new)):
            remove_favorite_path(root, old)
            remove_collection_path(root, old)
            remove_recent_path(root, old)
            return
        remap_favorite_path(root, old, new)
        remap_collection_path(root, old, new)
        remap_recent_path(root, old, new)

    def classify_and_ingest(params: dict[str, Any]) -> dict[str, Any]:
        config = cfg.get()
        paths = params.get("paths") or []
        if not isinstance(paths, list):
            raise ValueError("params.paths must be a list of file paths")
        jobs = ingest_paths(
            [str(p) for p in paths],
            config,
            classifier=classifier,
            on_progress=emit_progress,
        )
        history.record_ingest(jobs)
        return {"jobs": jobs}

    def get_list_library(_params: dict[str, Any]) -> dict[str, Any]:
        return list_library(cfg.get())

    def move_file(params: dict[str, Any]) -> dict[str, Any]:
        dest_folder = str(params.get("destFolder") or "")
        paths = _param_paths(params, "src")
        if not dest_folder or not paths:
            raise ValueError("src/paths and destFolder are required")
        config = cfg.get()
        moved: list[str] = []
        ops: list[dict[str, Any]] = []
        remaps: list[tuple[str, str]] = []
        for src in paths:
            source = resolve_library_file(config, src)
            path = move_library_file(config, src, dest_folder)
            remaps.append((str(source), path))
            if str(source) != path:
                ops.append({"kind": "move", "src": str(source), "dest": path})
            moved.append(path)
        history.push(ops)
        for old, new in remaps:
            _remap(old, new)
        return {"path": moved[0] if moved else "", "paths": moved}

    def rename(params: dict[str, Any]) -> dict[str, Any]:
        raw = str(params.get("path") or "")
        new_name = str(params.get("newName") or "")
        config = cfg.get()
        source = resolve_library_file(config, raw)
        dest = rename_file(str(source), normalize_new_name(source, new_name))
        history.record_move(str(source), dest)
        _remap(str(source), dest)
        return {"path": dest}

    def delete(params: dict[str, Any]) -> dict[str, Any]:
        config = cfg.get()
        root = require_ready_config(config)
        paths = _param_paths(params, "path")
        if not paths:
            raise ValueError("path/paths is required")
        ops: list[dict[str, Any]] = []
        for raw in paths:
            source = resolve_library_file(config, raw)
            resolved = str(source)
            favs = {str(Path(p).expanduser().resolve()) for p in load_favorite_paths(root)}
            collection_ids = [
                str(item["id"])
                for item in load_collections(root)
                if resolved in {str(Path(p).expanduser().resolve()) for p in item.get("paths") or []}
            ]
            stash = stash_deleted_file(root, resolved)
            ops.append(
                {
                    "kind": "delete",
                    "path": resolved,
                    "stash": stash,
                    "wasFavorite": resolved in favs,
                    "collectionIds": list(collection_ids),
                }
            )
            _remap(resolved, None)
        history.push(ops)
        return {"ok": True}

    def make_collection(params: dict[str, Any]) -> dict[str, Any]:
        root = _root()
        created = create_collection(root, str(params.get("name") or ""))
        history.record_collection_create(created["id"], created["name"])
        return created

    def add_file_to_collection(params: dict[str, Any]) -> dict[str, Any]:
        config = cfg.get()
        cid = str(params.get("id") or "").strip()
        if not cid:
            raise ValueError("id is required")
        paths = _param_paths(params, "path")
        if not paths:
            raise ValueError("path/paths is required")
        root = require_ready_config(config)
        collections = load_collections(root)
        before: list[str] = []
        for item in collections:
            if item["id"] == cid:
                before = [str(Path(p).expanduser().resolve()) for p in item.get("paths") or []]
                break
        added: list[str] = []
        ops: list[dict[str, Any]] = []
        result: dict[str, Any] = {"id": cid, "path": "", "paths": []}
        for raw in paths:
            source = resolve_library_file(config, raw)
            resolved = str(source)
            result = add_to_collection(root, cid, resolved)
            if resolved not in before and resolved not in added:
                ops.append({"kind": "collection_add", "id": cid, "path": resolved})
                added.append(resolved)
        history.push(ops)
        return {"id": cid, "path": result.get("path") or (added[0] if added else ""), "paths": added}

    def favorite(params: dict[str, Any]) -> dict[str, Any]:
        config = cfg.get()
        wanted = params.get("favorite")
        if not isinstance(wanted, bool):
            raise ValueError("favorite must be a boolean")
        paths = _param_paths(params, "path")
        if not paths:
            raise ValueError("path/paths is required")
        root = require_ready_config(config)
        current = {str(Path(p).expanduser().resolve()) for p in load_favorite_paths(root)}
        marked: list[str] = []
        ops: list[dict[str, Any]] = []
        for raw in paths:
            source = resolve_library_file(config, raw)
            resolved = str(source)
            previous = resolved in current
            set_favorite(root, resolved, wanted)
            if previous != wanted:
                ops.append(
                    {"kind": "favorite", "path": resolved, "previous": previous, "next": wanted}
                )
            marked.append(resolved)
            if wanted:
                current.add(resolved)
            else:
                current.discard(resolved)
        history.push(ops)
        return {"path": marked[0] if marked else "", "paths": marked, "favorite": wanted}

    def prepare_playback(params: dict[str, Any]) -> dict[str, Any]:
        source = resolve_library_file(cfg.get(), str(params.get("path") or ""))
        return waveform_and_preview(str(source))

    def save_config(params: dict[str, Any]) -> dict[str, Any]:
        previous = cfg.get()
        incoming = dict(params)
        mode = incoming.pop("libraryRootMode", None)
        if mode not in (None, "relocate", "fresh"):
            raise ValueError("libraryRootMode must be relocate or fresh")
        if not previous.get("needsOnboarding"):
            merged = {
                key: value
                for key, value in previous.items()
                if key not in ("needsOnboarding", "libraryRootProblem")
            }
            merged.update(incoming)
            incoming = merged
        old_root = previous.get("libraryRoot")
        new_root = incoming.get("libraryRoot")
        if (
            mode == "relocate"
            and old_root
            and new_root
            and not previous.get("needsOnboarding")
        ):
            if Path(old_root).expanduser().resolve() != Path(str(new_root)).expanduser().resolve():
                relocate_library(old_root, new_root)
        result = cfg.save(incoming)
        saved_root = (result.get("config") or {}).get("libraryRoot")
        if previous.get("libraryRoot") != saved_root:
            history.clear()
        return result

    def history_state(_params: dict[str, Any]) -> dict[str, bool]:
        return history.state()

    def undo(_params: dict[str, Any]) -> dict[str, bool]:
        return history.undo(library_root=_root(), remap=_remap)

    def redo(_params: dict[str, Any]) -> dict[str, bool]:
        return history.redo(library_root=_root(), remap=_remap)

    return {
        "ping": lambda _p: {"pong": True},
        "get_config": lambda _p: _public_config(cfg.get()),
        "save_config": save_config,
        "classify_and_ingest": classify_and_ingest,
        "list_library": get_list_library,
        "move_file": move_file,
        "rename_file": rename,
        "delete_file": delete,
        "set_favorite": favorite,
        "create_collection": make_collection,
        "add_to_collection": add_file_to_collection,
        "prepare_playback": prepare_playback,
        "history_state": history_state,
        "undo": undo,
        "redo": redo,
    }
