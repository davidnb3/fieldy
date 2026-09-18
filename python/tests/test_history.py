"""Undo/redo ingest (move and copy) plus library move."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

from core.classifier import YamnetClassifier
from core.config import YAMNET_CLASS_NAMES_ORDERED, ConfigStore
from core.metadata import read_tags
from ipc.handlers import build_handlers


class FakeSpeechClassifier(YamnetClassifier):
    def load(self) -> None:
        return

    def frame_scores(self, waveform_16k_mono: np.ndarray) -> np.ndarray:
        frames = np.zeros((4, 521), dtype=np.float32)
        frames[:, YAMNET_CLASS_NAMES_ORDERED.index("Speech")] = 0.9
        return frames


def _write_wav(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    n = 4800
    stereo = np.stack(
        [np.full(n, 0.1, dtype=np.float32), np.full(n, -0.1, dtype=np.float32)],
        axis=1,
    )
    sf.write(path, stereo, 48000, subtype="FLOAT")


def _handlers(tmp_path: Path, ingest_mode: str = "move"):
    library = tmp_path / "library"
    store = ConfigStore(pointer_path=tmp_path / "pointer.json")
    store.save({"libraryRoot": str(library), "ingestMode": ingest_mode})
    return build_handlers(store=store, classifier=FakeSpeechClassifier()), library


def test_undo_move_ingest_restores_original(tmp_path: Path):
    handlers, library = _handlers(tmp_path)
    src = tmp_path / "drop" / "take.wav"
    _write_wav(src)
    jobs = handlers["classify_and_ingest"]({"paths": [str(src)]})["jobs"]
    dest = Path(jobs[0]["movedTo"])
    assert dest.is_file()
    assert not src.exists()
    assert handlers["history_state"]({}) == {"canUndo": True, "canRedo": False}

    handlers["undo"]({})
    assert src.is_file()
    assert not dest.exists()
    assert handlers["history_state"]({}) == {"canUndo": False, "canRedo": True}

    handlers["redo"]({})
    assert dest.is_file() or (library / "Speech").exists()
    speech_files = list((library / "Speech").glob("*.wav"))
    assert len(speech_files) == 1
    assert not src.exists()


def test_undo_copy_ingest_keeps_original(tmp_path: Path):
    handlers, library = _handlers(tmp_path, ingest_mode="copy")
    src = tmp_path / "drop" / "take.wav"
    _write_wav(src)
    jobs = handlers["classify_and_ingest"]({"paths": [str(src)]})["jobs"]
    dest = Path(jobs[0]["movedTo"])
    assert src.is_file()
    assert dest.is_file()
    assert read_tags(str(src)) == []
    assert read_tags(str(dest)) == ["Speech"]

    handlers["undo"]({})
    assert src.is_file()
    assert not dest.exists()

    handlers["redo"]({})
    copies = list((library / "Speech").glob("*.wav"))
    assert src.is_file()
    assert len(copies) == 1
    assert read_tags(str(copies[0])) == ["Speech"]


def test_undo_library_move(tmp_path: Path):
    handlers, library = _handlers(tmp_path)
    src = library / "Speech" / "clip.wav"
    _write_wav(src)
    moved = handlers["move_file"]({"src": str(src), "destFolder": "Mixed"})
    dest = Path(moved["path"])
    assert dest.parent.name == "Mixed"
    handlers["undo"]({})
    assert src.is_file()
    assert not dest.exists()
    handlers["redo"]({})
    assert (library / "Mixed" / "clip.wav").is_file() or dest.exists()


def test_undo_rename_and_delete(tmp_path: Path):
    handlers, library = _handlers(tmp_path)
    src = library / "Speech" / "clip.wav"
    _write_wav(src)
    renamed = handlers["rename_file"]({"path": str(src), "newName": "take"})
    dest = Path(renamed["path"])
    assert dest.name == "take.wav"
    handlers["undo"]({})
    assert src.is_file()
    assert not dest.exists()
    handlers["redo"]({})
    assert dest.is_file() or (library / "Speech" / "take.wav").is_file()

    current = dest if dest.is_file() else library / "Speech" / "take.wav"
    handlers["delete_file"]({"path": str(current)})
    assert not current.exists()
    handlers["undo"]({})
    restored = list((library / "Speech").glob("*.wav"))
    assert len(restored) == 1


def test_undo_favorite(tmp_path: Path):
    handlers, library = _handlers(tmp_path)
    src = library / "Speech" / "clip.wav"
    _write_wav(src)
    handlers["set_favorite"]({"path": str(src), "favorite": True})
    assert handlers["list_library"]({})["favorites"][0]["name"] == "clip.wav"
    handlers["undo"]({})
    assert handlers["list_library"]({})["favorites"] == []
    handlers["redo"]({})
    assert handlers["list_library"]({})["favorites"][0]["name"] == "clip.wav"
