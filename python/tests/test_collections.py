"""Collections: virtual lists, not disk folders."""

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


def test_create_collection_and_add_file(tmp_path: Path):
    library = tmp_path / "library"
    store = ConfigStore(pointer_path=tmp_path / "pointer.json")
    store.save({"libraryRoot": str(library)})
    wav = library / "Speech" / "clip.wav"
    _write_wav(wav)
    handlers = build_handlers(store=store)
    created = handlers["create_collection"]({"name": "Night sessions"})
    assert created["name"] == "Night sessions"
    handlers["add_to_collection"]({"id": created["id"], "path": str(wav)})
    tree = list_library(store.get())
    assert len(tree["collections"]) == 1
    assert tree["collections"][0]["name"] == "Night sessions"
    assert [f["name"] for f in tree["collections"][0]["files"]] == ["clip.wav"]
    assert not (library / "Night sessions").exists()
    assert "Night sessions" not in [folder["name"] for folder in tree["folders"]]


def test_collection_remaps_on_move_and_rejects_reserved_name(tmp_path: Path):
    library = tmp_path / "library"
    store = ConfigStore(pointer_path=tmp_path / "pointer.json")
    store.save({"libraryRoot": str(library)})
    wav = library / "Speech" / "clip.wav"
    _write_wav(wav)
    handlers = build_handlers(store=store)
    created = handlers["create_collection"]({"name": "Cuts"})
    handlers["add_to_collection"]({"id": created["id"], "path": str(wav)})
    moved = handlers["move_file"]({"src": str(wav), "destFolder": "Mixed"})
    files = list_library(store.get())["collections"][0]["files"]
    assert files[0]["path"] == moved["path"]

    with pytest.raises(ValueError, match="reserved"):
        handlers["create_collection"]({"name": "Starred"})
