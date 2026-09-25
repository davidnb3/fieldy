"""Phase 6: list / move / rename / delete stay inside libraryRoot."""

from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from core.config import ConfigStore
from core.library import list_library, normalize_new_name
from core.metadata import write_tags
from ipc.handlers import build_handlers


def _write_wav(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    n = 4800
    stereo = np.stack(
        [np.full(n, 0.05, dtype=np.float32), np.full(n, -0.05, dtype=np.float32)],
        axis=1,
    )
    sf.write(path, stereo, 48000, subtype="FLOAT")


def _ready_store(tmp_path: Path) -> tuple[ConfigStore, Path]:
    library = tmp_path / "library"
    store = ConfigStore(pointer_path=tmp_path / "pointer.json")
    store.save({"libraryRoot": str(library)})
    return store, library


def test_list_library_always_has_mixed_and_existing_class_folders(tmp_path: Path):
    store, library = _ready_store(tmp_path)
    wav = library / "Speech" / "a.wav"
    _write_wav(wav)
    write_tags(str(wav), ["Speech"], score=0.82)
    (library / "not-a-class").mkdir()
    tree = list_library(store.get())
    names = [folder["name"] for folder in tree["folders"]]
    assert names[0] == "Mixed"
    assert "Speech" in names
    assert "not-a-class" not in names
    speech_files = next(f["files"] for f in tree["folders"] if f["name"] == "Speech")
    assert speech_files[0]["name"] == "a.wav"
    assert speech_files[0]["path"].endswith("a.wav")
    assert speech_files[0]["why"] == "Speech · 0.82"
    assert tree["recentlyAdded"] == []
    assert tree["favorites"] == []
    assert tree["collections"] == []


def test_handlers_move_rename_delete(tmp_path: Path):
    store, library = _ready_store(tmp_path)
    src = library / "Speech" / "clip.wav"
    _write_wav(src)
    handlers = build_handlers(store=store)

    moved = handlers["move_file"]({"src": str(src), "destFolder": "Mixed"})
    dest = Path(moved["path"])
    assert dest.parent.name == "Mixed"
    assert dest.is_file()
    assert not src.exists()

    renamed = handlers["rename_file"]({"path": str(dest), "newName": "renamed"})
    assert Path(renamed["path"]).name == "renamed.wav"

    handlers["delete_file"]({"path": renamed["path"]})
    assert not Path(renamed["path"]).exists()


def test_refuse_path_outside_library(tmp_path: Path):
    store, _library = _ready_store(tmp_path)
    handlers = build_handlers(store=store)
    outside = tmp_path / "escape.wav"
    _write_wav(outside)
    with pytest.raises(ValueError, match="outside libraryRoot"):
        handlers["delete_file"]({"path": str(outside)})


def test_refuse_illegal_move_folder(tmp_path: Path):
    store, library = _ready_store(tmp_path)
    src = library / "Mixed" / "clip.wav"
    _write_wav(src)
    handlers = build_handlers(store=store)
    with pytest.raises(ValueError, match="not Mixed or an AudioSet class"):
        handlers["move_file"]({"src": str(src), "destFolder": "My Podcasts"})
    assert not (library / "My Podcasts").exists()
    assert src.is_file()


def test_batch_move_and_star_undo_together(tmp_path: Path):
    store, library = _ready_store(tmp_path)
    a = library / "Speech" / "a.wav"
    b = library / "Speech" / "b.wav"
    _write_wav(a)
    _write_wav(b)
    handlers = build_handlers(store=store)
    handlers["set_favorite"]({"paths": [str(a), str(b)], "favorite": True})
    assert len(list_library(store.get())["favorites"]) == 2
    handlers["move_file"]({"paths": [str(a), str(b)], "destFolder": "Mixed"})
    mixed = next(f["files"] for f in list_library(store.get())["folders"] if f["name"] == "Mixed")
    assert {f["name"] for f in mixed} >= {"a.wav", "b.wav"}
    handlers["undo"]({})
    speech = next(f["files"] for f in list_library(store.get())["folders"] if f["name"] == "Speech")
    assert {f["name"] for f in speech} >= {"a.wav", "b.wav"}
    handlers["undo"]({})
    assert list_library(store.get())["favorites"] == []


def test_normalize_new_name_rejects_paths():
    with pytest.raises(ValueError):
        normalize_new_name(Path("/lib/a.wav"), "../x.wav")


def test_warmup_loads_injected_classifier(tmp_path: Path):
    store, _library = _ready_store(tmp_path)

    class Marker:
        def __init__(self) -> None:
            self.loaded = False

        def load(self) -> None:
            self.loaded = True

    marker = Marker()
    stages: list[str] = []
    handlers = build_handlers(
        store=store,
        classifier=marker,
        emit_progress=lambda payload: stages.append(payload.get("stage") or ""),
    )
    assert handlers["warmup"]({}) == {"ok": True, "ready": True}
    assert marker.loaded is True
    assert stages[0] == "warmup"
    assert stages[-1] == "warmup"
