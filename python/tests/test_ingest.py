"""Phase 5: classify, tag original, move into library folder."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from core.classifier import YamnetClassifier
from core.config import YAMNET_CLASS_NAMES_ORDERED, ConfigStore
from core.ingest import expand_audio_paths, ingest_paths
from core.metadata import read_tags, write_tags


class FakeSpeechClassifier(YamnetClassifier):
    def load(self) -> None:  # noqa: D401
        return

    def frame_scores(self, waveform_16k_mono: np.ndarray) -> np.ndarray:
        frames = np.zeros((4, 521), dtype=np.float32)
        frames[:, YAMNET_CLASS_NAMES_ORDERED.index("Speech")] = 0.9
        return frames


def _write_wav(path: Path) -> None:
    sr = 48000
    n = sr // 5
    stereo = np.stack(
        [np.full(n, 0.1, dtype=np.float32), np.full(n, -0.1, dtype=np.float32)],
        axis=1,
    )
    sf.write(path, stereo, sr, subtype="FLOAT")


def test_ingest_tags_and_moves_wav(tmp_path: Path):
    library = tmp_path / "library"
    store = ConfigStore(pointer_path=tmp_path / "pointer.json")
    store.save({"libraryRoot": str(library)})
    src = tmp_path / "drop" / "take.wav"
    src.parent.mkdir()
    _write_wav(src)

    stages: list[str] = []
    jobs = ingest_paths(
        [str(src)],
        store.get(),
        classifier=FakeSpeechClassifier(),
        on_progress=lambda p: stages.append(p["stage"]),
    )
    assert len(jobs) == 1
    job = jobs[0]
    assert job["ok"] is True
    assert job["destination"] == "Speech"
    assert job["tags"] == ["Speech"]
    moved = Path(job["movedTo"])
    assert moved.parent.name == "Speech"
    assert moved.is_file()
    assert not src.exists()
    assert read_tags(str(moved)) == ["Speech"]
    assert job["score"] == pytest.approx(0.9)
    assert job["why"] == "Speech · 0.90"
    assert (library / "Mixed").is_dir()
    assert "analyze" in stages and "tag" in stages and "done" in stages


def test_ingest_batch_continues_after_error(tmp_path: Path):
    library = tmp_path / "library"
    store = ConfigStore(pointer_path=tmp_path / "pointer.json")
    store.save({"libraryRoot": str(library)})
    good = tmp_path / "ok.wav"
    _write_wav(good)
    jobs = ingest_paths(
        [str(tmp_path / "missing.wav"), str(good)],
        store.get(),
        classifier=FakeSpeechClassifier(),
    )
    assert jobs[0]["ok"] is False
    assert jobs[1]["ok"] is True
    assert Path(jobs[1]["movedTo"]).is_file()


def test_ingest_collision_gets_unique_name(tmp_path: Path):
    library = tmp_path / "library"
    store = ConfigStore(pointer_path=tmp_path / "pointer.json")
    store.save({"libraryRoot": str(library)})
    first = tmp_path / "a" / "clip.wav"
    second = tmp_path / "b" / "clip.wav"
    first.parent.mkdir()
    second.parent.mkdir()
    _write_wav(first)
    _write_wav(second)
    jobs = ingest_paths(
        [str(first), str(second)],
        store.get(),
        classifier=FakeSpeechClassifier(),
    )
    names = {Path(job["movedTo"]).name for job in jobs}
    assert names == {"clip.wav", "clip_1.wav"}


def test_ingest_copy_keeps_source_untagged(tmp_path: Path):
    library = tmp_path / "library"
    store = ConfigStore(pointer_path=tmp_path / "pointer.json")
    store.save({"libraryRoot": str(library), "ingestMode": "copy"})
    src = tmp_path / "drop" / "take.wav"
    src.parent.mkdir()
    _write_wav(src)
    jobs = ingest_paths([str(src)], store.get(), classifier=FakeSpeechClassifier())
    dest = Path(jobs[0]["movedTo"])
    assert src.is_file()
    assert dest.is_file()
    assert jobs[0]["copied"] is True
    assert read_tags(str(src)) == []
    assert read_tags(str(dest)) == ["Speech"]


def test_reingest_library_file_moves_when_class_changes(tmp_path: Path):
    library = tmp_path / "library"
    store = ConfigStore(pointer_path=tmp_path / "pointer.json")
    store.save({"libraryRoot": str(library)})
    src = library / "Silence" / "clip.wav"
    src.parent.mkdir(parents=True)
    _write_wav(src)
    write_tags(str(src), ["Silence"])
    jobs = ingest_paths([str(src)], store.get(), classifier=FakeSpeechClassifier())
    assert jobs[0]["ok"] is True
    assert jobs[0]["destination"] == "Speech"
    moved = Path(jobs[0]["movedTo"])
    assert moved.parent.name == "Speech"
    assert not src.exists()
    assert read_tags(str(moved)) == ["Speech"]


def test_expand_audio_paths_walks_directory(tmp_path: Path):
    nested = tmp_path / "card" / "folder"
    nested.mkdir(parents=True)
    _write_wav(nested / "a.wav")
    (nested / "notes.txt").write_text("nope")
    _write_wav(nested / "a.wav")
    sf.write(nested / "b.flac", np.zeros(1600, dtype=np.float32), 16000, format="FLAC")
    (nested / "notes.txt").write_text("nope")
    found = expand_audio_paths([str(tmp_path / "card")])
    assert [p.name for p in found] == ["a.wav", "b.flac"]


def test_ingest_flac_aiff_mp3(tmp_path: Path):
    library = tmp_path / "library"
    store = ConfigStore(pointer_path=tmp_path / "pointer.json")
    store.save({"libraryRoot": str(library)})
    sr = 16000
    t = np.linspace(0, 0.2, int(sr * 0.2), endpoint=False)
    tone = (0.12 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    flac = tmp_path / "a.flac"
    aiff = tmp_path / "a.aiff"
    mp3 = tmp_path / "a.mp3"
    sf.write(flac, tone, sr, format="FLAC")
    sf.write(aiff, tone, sr, format="AIFF", subtype="FLOAT")
    sf.write(mp3, tone, sr, format="MP3")
    jobs = ingest_paths(
        [str(flac), str(aiff), str(mp3)],
        store.get(),
        classifier=FakeSpeechClassifier(),
    )
    assert all(job["ok"] for job in jobs)
    assert {Path(job["movedTo"]).suffix.lower() for job in jobs} == {".flac", ".aiff", ".mp3"}
    for job in jobs:
        assert read_tags(job["movedTo"]) == ["Speech"]
