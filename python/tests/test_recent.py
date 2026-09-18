"""Recently added: persist new drops per libraryRoot, skip reclassify."""

from pathlib import Path

import numpy as np
import soundfile as sf

from core.config import ConfigStore, YAMNET_CLASS_NAMES_ORDERED
from core.ingest import ingest_paths
from core.library import list_library
from core.recent import RECENT_CAP, record_new_ingest, save_recent_paths
from core.classifier import YamnetClassifier


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
        [np.full(n, 0.05, dtype=np.float32), np.full(n, -0.05, dtype=np.float32)],
        axis=1,
    )
    sf.write(path, stereo, 48000, subtype="FLOAT")


def test_new_ingest_is_recent_newest_first(tmp_path: Path):
    library = tmp_path / "library"
    store = ConfigStore(pointer_path=tmp_path / "pointer.json")
    store.save({"libraryRoot": str(library)})
    first = tmp_path / "drop" / "a.wav"
    second = tmp_path / "drop" / "b.wav"
    _write_wav(first)
    _write_wav(second)
    ingest_paths([str(first)], store.get(), classifier=FakeSpeechClassifier())
    ingest_paths([str(second)], store.get(), classifier=FakeSpeechClassifier())
    tree = list_library(store.get())
    names = [f["name"] for f in tree["recentlyAdded"]]
    assert names == ["b.wav", "a.wav"]
    assert "Recently added" not in [folder["name"] for folder in tree["folders"]]
    assert not (library / "Recently added").exists()


def test_reclassify_does_not_reshuffle_recent(tmp_path: Path):
    library = tmp_path / "library"
    store = ConfigStore(pointer_path=tmp_path / "pointer.json")
    store.save({"libraryRoot": str(library)})
    dropped = tmp_path / "outside" / "clip.wav"
    _write_wav(dropped)
    jobs = ingest_paths([str(dropped)], store.get(), classifier=FakeSpeechClassifier())
    moved = Path(jobs[0]["movedTo"])
    before = list_library(store.get())["recentlyAdded"]
    ingest_paths([str(moved)], store.get(), classifier=FakeSpeechClassifier())
    after = list_library(store.get())["recentlyAdded"]
    assert [f["path"] for f in after] == [f["path"] for f in before]


def test_failed_job_is_not_recent(tmp_path: Path):
    library = tmp_path / "library"
    store = ConfigStore(pointer_path=tmp_path / "pointer.json")
    store.save({"libraryRoot": str(library)})
    jobs = ingest_paths(
        [str(tmp_path / "missing.wav")],
        store.get(),
        classifier=FakeSpeechClassifier(),
    )
    assert jobs[0]["ok"] is False
    tree = list_library(store.get())
    assert tree["recentlyAdded"] == []


def test_missing_recent_path_is_pruned(tmp_path: Path):
    library = tmp_path / "library"
    store = ConfigStore(pointer_path=tmp_path / "pointer.json")
    store.save({"libraryRoot": str(library)})
    gone = library / "Speech" / "gone.wav"
    gone.parent.mkdir(parents=True, exist_ok=True)
    save_recent_paths(library, [str(gone)])
    live = library / "Speech" / "live.wav"
    _write_wav(live)
    save_recent_paths(library, [str(gone), str(live)])
    tree = list_library(store.get())
    assert [f["name"] for f in tree["recentlyAdded"]] == ["live.wav"]


def test_recent_cap(tmp_path: Path):
    library = tmp_path / "library"
    library.mkdir()
    jobs = [
        {
            "ok": True,
            "path": str(tmp_path / "drop" / f"{i}.wav"),
            "movedTo": str(library / "Speech" / f"{i}.wav"),
        }
        for i in range(RECENT_CAP + 5)
    ]
    for i in range(RECENT_CAP + 5):
        (library / "Speech").mkdir(exist_ok=True)
        (library / "Speech" / f"{i}.wav").write_text("x")
    record_new_ingest(library, jobs)
    from core.recent import load_recent_paths

    paths = load_recent_paths(library)
    assert len(paths) == RECENT_CAP
    assert paths[0].endswith(f"{RECENT_CAP + 4}.wav")
