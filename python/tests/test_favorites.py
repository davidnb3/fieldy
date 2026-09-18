"""Favorites: persist per libraryRoot, remap on move/rename, prune missing."""

from pathlib import Path

import numpy as np
import soundfile as sf

from core.config import ConfigStore
from core.library import list_library
from ipc.handlers import build_handlers


def _write_wav(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    n = 4800
    stereo = np.stack(
        [np.full(n, 0.05, dtype=np.float32), np.full(n, -0.05, dtype=np.float32)],
        axis=1,
    )
    sf.write(path, stereo, 48000, subtype="FLOAT")


def test_set_favorite_lists_and_is_not_a_folder(tmp_path: Path):
    library = tmp_path / "library"
    store = ConfigStore(pointer_path=tmp_path / "pointer.json")
    store.save({"libraryRoot": str(library)})
    wav = library / "Speech" / "clip.wav"
    _write_wav(wav)
    handlers = build_handlers(store=store)
    handlers["set_favorite"]({"path": str(wav), "favorite": True})
    tree = list_library(store.get())
    assert [f["name"] for f in tree["favorites"]] == ["clip.wav"]
    speech = next(f for f in tree["folders"] if f["name"] == "Speech")
    assert speech["files"][0]["favorite"] is True
    assert "Favorites" not in [folder["name"] for folder in tree["folders"]]
    assert not (library / "Favorites").exists()


def test_unfavorite_and_missing_path_pruned(tmp_path: Path):
    library = tmp_path / "library"
    store = ConfigStore(pointer_path=tmp_path / "pointer.json")
    store.save({"libraryRoot": str(library)})
    wav = library / "Mixed" / "keep.wav"
    gone = library / "Mixed" / "gone.wav"
    _write_wav(wav)
    handlers = build_handlers(store=store)
    handlers["set_favorite"]({"path": str(wav), "favorite": True})
    handlers["set_favorite"]({"path": str(wav), "favorite": False})
    assert list_library(store.get())["favorites"] == []

    handlers["set_favorite"]({"path": str(wav), "favorite": True})
    from core.favorites import save_favorite_paths

    save_favorite_paths(library, [str(gone), str(wav)])
    tree = list_library(store.get())
    assert [f["name"] for f in tree["favorites"]] == ["keep.wav"]


def test_favorite_survives_move_and_rename(tmp_path: Path):
    library = tmp_path / "library"
    store = ConfigStore(pointer_path=tmp_path / "pointer.json")
    store.save({"libraryRoot": str(library)})
    wav = library / "Speech" / "clip.wav"
    _write_wav(wav)
    handlers = build_handlers(store=store)
    handlers["set_favorite"]({"path": str(wav), "favorite": True})
    moved = handlers["move_file"]({"src": str(wav), "destFolder": "Mixed"})
    names = [f["name"] for f in list_library(store.get())["favorites"]]
    assert names == ["clip.wav"]
    assert Path(moved["path"]).parent.name == "Mixed"
    renamed = handlers["rename_file"]({"path": moved["path"], "newName": "starred"})
    assert [f["name"] for f in list_library(store.get())["favorites"]] == ["starred.wav"]
    handlers["delete_file"]({"path": renamed["path"]})
    assert list_library(store.get())["favorites"] == []
