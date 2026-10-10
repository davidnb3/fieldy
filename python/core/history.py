"""Session undo/redo for ingest, move, rename, delete, and library lists."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

from core.favorites import set_favorite
from core.fs_ops import copy_into_folder, relocate, unique_dest
from core.metadata import write_tags
from core.user_collections import add_to_collection, create_collection, delete_collection, remove_from_collection

RemapFn = Callable[[str, str | None], None]
HISTORY_CAP = 50
UNDO_STASH = ".Fieldy-undo"


class History:
    def __init__(self) -> None:
        self._undo: list[list[dict[str, Any]]] = []
        self._redo: list[list[dict[str, Any]]] = []

    def state(self) -> dict[str, bool]:
        return {"canUndo": bool(self._undo), "canRedo": bool(self._redo)}

    def clear(self) -> None:
        self._undo.clear()
        self._redo.clear()

    def push(self, ops: list[dict[str, Any]]) -> None:
        if not ops:
            return
        self._undo.append(ops)
        self._redo.clear()
        if len(self._undo) > HISTORY_CAP:
            self._undo.pop(0)

    def record_ingest(self, jobs: list[dict[str, Any]]) -> None:
        ops = [_ingest_op(job) for job in jobs if job.get("ok") and job.get("movedTo")]
        self.push(ops)

    def record_move(self, src: str, dest: str) -> None:
        if src != dest:
            self.push([{"kind": "move", "src": src, "dest": dest}])

    def record_collection_create(self, collection_id: str, name: str) -> None:
        self.push([{"kind": "collection_create", "id": collection_id, "name": name}])

    def rewrite_paths(self, old: str, new: str | None) -> None:
        if not old or old == new:
            return
        for group in (*self._undo, *self._redo):
            for op in group:
                for key in ("src", "dest", "path", "origin", "libraryPath", "stash"):
                    if op.get(key) != old:
                        continue
                    if new is None:
                        continue
                    op[key] = new

    def undo(self, *, library_root: Path, remap: RemapFn | None = None) -> dict[str, bool]:
        if not self._undo:
            return self.state()
        ops = self._undo.pop()
        wrapped = self._wrap_remap(remap)
        for op in reversed(ops):
            _apply(op, undo=True, library_root=library_root, remap=wrapped)
        self._redo.append(ops)
        return self.state()

    def redo(self, *, library_root: Path, remap: RemapFn | None = None) -> dict[str, bool]:
        if not self._redo:
            return self.state()
        ops = self._redo.pop()
        wrapped = self._wrap_remap(remap)
        for op in ops:
            _apply(op, undo=False, library_root=library_root, remap=wrapped)
        self._undo.append(ops)
        return self.state()

    def _wrap_remap(self, remap: RemapFn | None) -> RemapFn:
        def wrapped(old: str, new: str | None) -> None:
            self.rewrite_paths(old, new)
            if remap:
                remap(old, new)

        return wrapped


def stash_deleted_file(library_root: Path, src: str) -> str:
    stash_dir = Path(library_root) / UNDO_STASH
    stash_dir.mkdir(parents=True, exist_ok=True)
    dest = unique_dest(stash_dir, f"{uuid4().hex}_{Path(src).name}")
    return relocate(src, str(dest))


def _ingest_op(job: dict[str, Any]) -> dict[str, Any]:
    dest = str(job["movedTo"])
    return {
        "kind": "ingest",
        "origin": str(job.get("previousPath") or job["path"]),
        "libraryPath": dest,
        "destDir": str(Path(dest).parent),
        "copied": bool(job.get("copied")),
        "wasLibrary": bool(job.get("wasLibrary")),
        "tags": list(job.get("tags") or []),
        "score": job.get("score"),
        "previousTags": list(job.get("previousTags") or []),
        "previousScore": job.get("previousScore"),
    }


def _apply(
    op: dict[str, Any],
    *,
    undo: bool,
    library_root: Path,
    remap: RemapFn | None,
) -> None:
    kind = op.get("kind")
    if kind == "move":
        _apply_move(op, undo=undo, remap=remap)
        return
    if kind == "ingest":
        _apply_ingest(op, undo=undo, remap=remap)
        return
    if kind == "delete":
        _apply_delete(op, undo=undo, library_root=library_root, remap=remap)
        return
    if kind == "favorite":
        wanted = bool(op["previous"] if undo else op["next"])
        set_favorite(library_root, str(op["path"]), wanted)
        return
    if kind == "collection_create":
        if undo:
            delete_collection(library_root, str(op["id"]))
        else:
            create_collection(library_root, str(op["name"]), collection_id=str(op["id"]))
        return
    if kind == "collection_add":
        if undo:
            remove_from_collection(library_root, str(op["id"]), str(op["path"]))
        else:
            add_to_collection(library_root, str(op["id"]), str(op["path"]))


def _apply_move(op: dict[str, Any], *, undo: bool, remap: RemapFn | None) -> None:
    src = str(op["dest"] if undo else op["src"])
    dest = str(op["src"] if undo else op["dest"])
    new_path = relocate(src, dest)
    if undo:
        op["src"] = new_path
    else:
        op["dest"] = new_path
    if remap:
        remap(src, new_path)


def _apply_ingest(op: dict[str, Any], *, undo: bool, remap: RemapFn | None) -> None:
    if undo:
        current = str(op["libraryPath"])
        if op["copied"] and not op["wasLibrary"]:
            path = Path(current)
            if path.is_file():
                path.unlink()
            if remap:
                remap(current, None)
            return
        new_path = relocate(current, str(op["origin"]))
        op["origin"] = new_path
        if op["wasLibrary"]:
            write_tags(new_path, list(op.get("previousTags") or []), score=op.get("previousScore"))
        if remap:
            remap(current, new_path)
        return

    origin = str(op["origin"])
    dest_dir = str(op["destDir"])
    if op["copied"] and not op["wasLibrary"]:
        new_path = copy_into_folder(origin, dest_dir)
        write_tags(new_path, list(op.get("tags") or []), score=op.get("score"))
        op["libraryPath"] = new_path
        if remap:
            remap(origin, new_path)
        return
    if op["wasLibrary"]:
        write_tags(origin, list(op.get("tags") or []), score=op.get("score"))
    new_path = relocate(origin, str(Path(dest_dir) / Path(op["libraryPath"]).name))
    op["libraryPath"] = new_path
    if remap:
        remap(origin, new_path)


def _apply_delete(
    op: dict[str, Any],
    *,
    undo: bool,
    library_root: Path,
    remap: RemapFn | None,
) -> None:
    if undo:
        current = str(op["stash"])
        new_path = relocate(current, str(op["path"]))
        op["path"] = new_path
        if remap:
            remap(current, new_path)
        if op.get("wasFavorite"):
            set_favorite(library_root, new_path, True)
        for cid in op.get("collectionIds") or []:
            add_to_collection(library_root, str(cid), new_path)
        return
    current = str(op["path"])
    new_path = relocate(current, str(op["stash"]))
    op["stash"] = new_path
    if remap:
        remap(current, None)
