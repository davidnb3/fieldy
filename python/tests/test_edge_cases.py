"""Phase 11: 32-bit float 48/96 kHz, long-file YAMNet frames, Mixed vs related, illegal dest."""

from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from core.analyze import destination_from_frames
from core.classifier import PATCH_HOP_SECONDS, PATCH_WINDOW_SECONDS, SAMPLE_RATE, YamnetClassifier
from core.config import ConfigStore, YAMNET_CLASS_NAMES_ORDERED
from core.ingest import ingest_paths
from core.metadata import read_tags
from core.preprocess import audio_info, yamnet_waveform
from ipc.handlers import build_handlers


def _pcm_fingerprint(path: Path) -> tuple[bytes, dict]:
    pcm, sr = sf.read(str(path), dtype="float32", always_2d=True)
    info = audio_info(str(path))
    digest = hashlib.sha256(np.ascontiguousarray(pcm).tobytes()).digest()
    return digest, {**info, "sr_read": sr, "shape": pcm.shape}


def _write_float32_stereo(path: Path, *, sr: int, seconds: float, tone: bool = True) -> None:
    n = int(sr * seconds)
    if tone:
        t = np.linspace(0, seconds, n, endpoint=False, dtype=np.float64)
        left = (0.2 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
        right = (0.05 * np.sin(2 * np.pi * 880 * t)).astype(np.float32)
    else:
        left = np.full(n, 0.02, dtype=np.float32)
        right = np.full(n, -0.02, dtype=np.float32)
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, np.stack([left, right], axis=1), sr, subtype="FLOAT")


def _n_frames(samples: int) -> int:
    seconds = samples / SAMPLE_RATE
    if seconds < 0.975:
        return 1
    return 1 + int((seconds - PATCH_WINDOW_SECONDS) / PATCH_HOP_SECONDS)


class FrameCountSpeechClassifier(YamnetClassifier):
    def load(self) -> None:
        return

    def frame_scores(self, waveform_16k_mono: np.ndarray) -> np.ndarray:
        n = int(np.asarray(waveform_16k_mono, dtype=np.float32).reshape(-1).shape[0])
        frames = np.zeros((_n_frames(n), 521), dtype=np.float32)
        frames[:, YAMNET_CLASS_NAMES_ORDERED.index("Speech")] = 0.9
        return frames


class SplitClassifier(YamnetClassifier):
    def __init__(self, left: str, right: str) -> None:
        super().__init__()
        self._left = left
        self._right = right

    def load(self) -> None:
        return

    def frame_scores(self, waveform_16k_mono: np.ndarray) -> np.ndarray:
        n = int(np.asarray(waveform_16k_mono, dtype=np.float32).reshape(-1).shape[0])
        frames = np.zeros((_n_frames(n), 521), dtype=np.float32)
        half = max(1, frames.shape[0] // 2)
        frames[:half, YAMNET_CLASS_NAMES_ORDERED.index(self._left)] = 0.9
        frames[half:, YAMNET_CLASS_NAMES_ORDERED.index(self._right)] = 0.9
        return frames


def _ready_store(tmp_path: Path) -> tuple[ConfigStore, Path]:
    library = tmp_path / "library"
    store = ConfigStore(pointer_path=tmp_path / "pointer.json")
    store.save({"libraryRoot": str(library)})
    return store, library


def test_96k_and_48k_analysis_is_16k_mono_original_pristine(tmp_path: Path):
    for sr, name in ((48000, "h6_48k.wav"), (96000, "h6_96k.wav")):
        wav = tmp_path / name
        _write_float32_stereo(wav, sr=sr, seconds=0.5)
        before, info = _pcm_fingerprint(wav)
        y = yamnet_waveform(str(wav))
        after, info_after = _pcm_fingerprint(wav)
        assert after == before
        assert info["subtype"] == "FLOAT"
        assert info["channels"] == 2
        assert info["samplerate"] == sr
        assert info_after["frames"] == info["frames"]
        assert y.dtype == np.float32 and y.ndim == 1
        assert abs(y.shape[0] - int(0.5 * SAMPLE_RATE)) <= 2


def test_ingest_96k_float_pcm_unchanged_and_not_transcoded(tmp_path: Path):
    store, library = _ready_store(tmp_path)
    src = tmp_path / "drop" / "take96.wav"
    _write_float32_stereo(src, sr=96000, seconds=0.4)
    before, _info = _pcm_fingerprint(src)
    jobs = ingest_paths(
        [str(src)],
        store.get(),
        classifier=FrameCountSpeechClassifier(),
    )
    assert jobs[0]["ok"] is True
    moved = Path(jobs[0]["movedTo"])
    after, info = _pcm_fingerprint(moved)
    assert after == before
    assert info["subtype"] == "FLOAT"
    assert info["samplerate"] == 96000
    assert info["channels"] == 2
    assert moved.parent.name == "Speech"
    assert not (library / "Long Samples").exists()


def test_ingest_long_file_classifies_all_frames_not_long_samples(tmp_path: Path):
    store, library = _ready_store(tmp_path)
    src = tmp_path / "long.wav"
    _write_float32_stereo(src, sr=48000, seconds=70.0, tone=False)
    jobs = ingest_paths(
        [str(src)],
        store.get(),
        classifier=FrameCountSpeechClassifier(),
    )
    job = jobs[0]
    assert job["ok"] is True
    assert job["frames"] > 100
    assert job["destination"] == "Speech"
    assert job["destination"] != "Long Samples"
    moved = Path(job["movedTo"])
    assert moved.parent.name == "Speech"
    assert not (library / "Long Samples").exists()
    info = audio_info(str(moved))
    assert info["subtype"] == "FLOAT"
    assert abs(info["duration"] - 70.0) < 0.05


def test_ingest_unrelated_time_split_goes_to_mixed_with_tags(tmp_path: Path):
    store, _library = _ready_store(tmp_path)
    src = tmp_path / "split.wav"
    _write_float32_stereo(src, sr=48000, seconds=6.0, tone=False)
    jobs = ingest_paths(
        [str(src)],
        store.get(),
        classifier=SplitClassifier("Water", "Speech"),
    )
    job = jobs[0]
    assert job["ok"] is True
    assert job["destination"] == "Mixed"
    assert set(job["tags"]) == {"Water", "Speech"}
    assert job["why"].startswith("Mixed · ")
    assert "Water" in job["why"] and "Speech" in job["why"]
    assert Path(job["movedTo"]).parent.name == "Mixed"
    assert set(read_tags(job["movedTo"])) == {"Water", "Speech"}


def test_ingest_related_water_labels_stay_on_top_class(tmp_path: Path):
    store, library = _ready_store(tmp_path)
    src = tmp_path / "pour.wav"
    _write_float32_stereo(src, sr=48000, seconds=6.0, tone=False)
    jobs = ingest_paths(
        [str(src)],
        store.get(),
        classifier=SplitClassifier("Pour", "Water"),
    )
    job = jobs[0]
    assert job["ok"] is True
    assert job["destination"] in {"Pour", "Water"}
    assert job["destination"] != "Mixed"
    assert set(job["tags"]) == {"Pour", "Water"}
    assert Path(job["movedTo"]).parent.name == job["destination"]
    assert (library / job["destination"]).is_dir()
    assert not (library / "Long Samples").exists()


def test_silence_patches_do_not_force_mixed():
    names = YAMNET_CLASS_NAMES_ORDERED
    frames = np.zeros((18, 521), dtype=np.float32)
    frames[:12, names.index("Water")] = 0.85
    frames[12:, names.index("Silence")] = 0.9
    dest, matching, _clip = destination_from_frames(frames, names, threshold=0.3)
    assert dest == "Water"
    assert "Water" in matching
    assert "Silence" in matching


def test_illegal_dest_folder_errors_and_does_not_mkdir(tmp_path: Path):
    store, library = _ready_store(tmp_path)
    src = library / "Mixed" / "clip.wav"
    _write_float32_stereo(src, sr=48000, seconds=0.2, tone=False)
    handlers = build_handlers(store=store)
    with pytest.raises(ValueError, match="not Mixed or an AudioSet class"):
        handlers["move_file"]({"src": str(src), "destFolder": "My Podcasts"})
    assert src.is_file()
    assert not (library / "My Podcasts").exists()
