from __future__ import annotations

from typing import Any, Callable

from core.config import ConfigStore
from core.fs_ops import delete_file, rename_file
from core.ingest import ingest_paths
from core.library import (
    list_library,
    move_library_file,
    normalize_new_name,
    resolve_library_file,
)
from core.playback import waveform_and_preview

Handler = Callable[[dict[str, Any]], Any]
ProgressFn = Callable[[dict[str, Any]], None]


def build_handlers(
    store: ConfigStore | None = None,
    emit_progress: ProgressFn | None = None,
    classifier=None,
) -> dict[str, Handler]:
    cfg = store or ConfigStore()

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
        return {"jobs": jobs}

    def get_list_library(_params: dict[str, Any]) -> dict[str, Any]:
        return list_library(cfg.get())

    def move_file(params: dict[str, Any]) -> dict[str, Any]:
        src = str(params.get("src") or "")
        dest_folder = str(params.get("destFolder") or "")
        if not src or not dest_folder:
            raise ValueError("src and destFolder are required")
        path = move_library_file(cfg.get(), src, dest_folder)
        return {"path": path}

    def rename(params: dict[str, Any]) -> dict[str, Any]:
        raw = str(params.get("path") or "")
        new_name = str(params.get("newName") or "")
        source = resolve_library_file(cfg.get(), raw)
        dest_name = normalize_new_name(source, new_name)
        return {"path": rename_file(str(source), dest_name)}

    def delete(params: dict[str, Any]) -> dict[str, Any]:
        source = resolve_library_file(cfg.get(), str(params.get("path") or ""))
        delete_file(str(source))
        return {"ok": True}

    def prepare_playback(params: dict[str, Any]) -> dict[str, Any]:
        source = resolve_library_file(cfg.get(), str(params.get("path") or ""))
        return waveform_and_preview(str(source))

    return {
        "ping": lambda _p: {"pong": True},
        "get_config": lambda _p: cfg.get(),
        "save_config": cfg.save,
        "classify_and_ingest": classify_and_ingest,
        "list_library": get_list_library,
        "move_file": move_file,
        "rename_file": rename,
        "delete_file": delete,
        "prepare_playback": prepare_playback,
    }
