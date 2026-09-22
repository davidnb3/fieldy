"""Changing libraryRoot: relocate files or start fresh."""

from pathlib import Path

import numpy as np
import pytest
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


def test_save_config_relocate_moves_files_and_stars(tmp_path: Path):
    old = tmp_path / "old"
    new = tmp_path / "new"
    store = ConfigStore(pointer_path=tmp_path / "pointer.json")
    store.save({"libraryRoot": str(old)})
    wav = old / "Speech" / "clip.wav"
    _write_wav(wav)
    handlers = build_handlers(store=store)
    handlers["set_favorite"]({"path": str(wav), "favorite": True})
    created = handlers["create_collection"]({"name": "Cuts"})
    handlers["add_to_collection"]({"id": created["id"], "path": str(wav)})

    handlers["save_config"]({"libraryRoot": str(new), "libraryRootMode": "relocate"})

    dest = new / "Speech" / "clip.wav"
    assert dest.is_file()
    handlers["set_favorite"]({"path": str(wav), "favorite": False})
    handlers["set_favorite"]({"path": str(wav), "favorite": True})
    tree = list_library(store.get())
    assert Path(tree["libraryRoot"]).resolve() == new.resolve()
    assert [f["name"] for f in tree["favorites"]] == ["clip.wav"]
    listed = next(f for f in tree["folders"] if f["name"] == "Speech")["files"][0]["path"]
    handlers["set_favorite"]({"path": listed, "favorite": False})
    handlers["set_favorite"]({"path": listed, "favorite": True})
    assert [f["name"] for f in list_library(store.get())["favorites"]] == ["clip.wav"]
    assert Path(tree["favorites"][0]["path"]).resolve() == dest.resolve()
    assert tree["collections"][0]["files"][0]["name"] == "clip.wav"
    assert (old / ".Fieldy-favorites.json").is_file()


def test_save_config_fresh_leaves_old_library(tmp_path: Path):
    old = tmp_path / "old"
    new = tmp_path / "new"
    store = ConfigStore(pointer_path=tmp_path / "pointer.json")
    store.save({"libraryRoot": str(old)})
    wav = old / "Speech" / "clip.wav"
    _write_wav(wav)
    handlers = build_handlers(store=store)
    handlers["set_favorite"]({"path": str(wav), "favorite": True})

    handlers["save_config"]({"libraryRoot": str(new), "libraryRootMode": "fresh"})

    assert wav.is_file()
    assert not (new / "Speech").exists()
    tree = list_library(store.get())
    assert Path(tree["libraryRoot"]).resolve() == new.resolve()
    assert tree["favorites"] == []
    speech = [folder for folder in tree["folders"] if folder["name"] == "Speech"]
    assert speech == []


def test_relocate_rejects_nested_library(tmp_path: Path):
    old = tmp_path / "old"
    store = ConfigStore(pointer_path=tmp_path / "pointer.json")
    store.save({"libraryRoot": str(old)})
    handlers = build_handlers(store=store)
    nested = old / "inside"
    nested.mkdir()
    with pytest.raises(ValueError, match="inside"):
        handlers["save_config"]({"libraryRoot": str(nested), "libraryRootMode": "relocate"})
