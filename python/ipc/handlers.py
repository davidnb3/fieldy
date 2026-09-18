from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

from core.config import ConfigStore
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
        src = str(params.get("src") or "")
        dest_folder = str(params.get("destFolder") or "")
        if not src or not dest_folder:
            raise ValueError("src and destFolder are required")
        config = cfg.get()
        source = resolve_library_file(config, src)
        path = move_library_file(config, src, dest_folder)
        history.record_move(str(source), path)
        _remap(str(source), path)
        return {"path": path}

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
        source = resolve_library_file(config, str(params.get("path") or ""))
        root = require_ready_config(config)
        resolved = str(source)
        favs = {str(Path(p).expanduser().resolve()) for p in load_favorite_paths(root)}
        collection_ids = [
            str(item["id"])
            for item in load_collections(root)
            if resolved in {str(Path(p).expanduser().resolve()) for p in item.get("paths") or []}
        ]
        stash = stash_deleted_file(root, resolved)
        history.record_delete(
            resolved,
            stash,
            was_favorite=resolved in favs,
            collection_ids=collection_ids,
        )
        _remap(resolved, None)
        return {"ok": True}

    def make_collection(params: dict[str, Any]) -> dict[str, Any]:
        root = _root()
        created = create_collection(root, str(params.get("name") or ""))
        history.record_collection_create(created["id"], created["name"])
        return created

    def add_file_to_collection(params: dict[str, Any]) -> dict[str, Any]:
        config = cfg.get()
        source = resolve_library_file(config, str(params.get("path") or ""))
        cid = str(params.get("id") or "").strip()
        if not cid:
            raise ValueError("id is required")
        root = require_ready_config(config)
        resolved = str(source)
        before = []
        for item in load_collections(root):
            if item["id"] == cid:
                before = [str(Path(p).expanduser().resolve()) for p in item.get("paths") or []]
                break
        result = add_to_collection(root, cid, resolved)
        history.record_collection_add(cid, resolved, resolved not in before)
        return result

    def favorite(params: dict[str, Any]) -> dict[str, Any]:
        config = cfg.get()
        source = resolve_library_file(config, str(params.get("path") or ""))
        wanted = params.get("favorite")
        if not isinstance(wanted, bool):
            raise ValueError("favorite must be a boolean")
        root = require_ready_config(config)
        resolved = str(source)
        previous = resolved in {
            str(Path(p).expanduser().resolve()) for p in load_favorite_paths(root)
        }
        marked = set_favorite(root, resolved, wanted)
        history.record_favorite(resolved, previous, marked)
        return {"path": resolved, "favorite": marked}

    def prepare_playback(params: dict[str, Any]) -> dict[str, Any]:
        source = resolve_library_file(cfg.get(), str(params.get("path") or ""))
        return waveform_and_preview(str(source))

    def save_config(params: dict[str, Any]) -> dict[str, Any]:
        previous = cfg.get()
        result = cfg.save(params)
        new_root = (result.get("config") or {}).get("libraryRoot")
        if previous.get("libraryRoot") != new_root:
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
        "get_config": lambda _p: cfg.get(),
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
