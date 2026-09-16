"""Playback preview is 16-bit temp WAV; original 32-bit float is unchanged."""

from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from core.config import ConfigStore
from core.playback import waveform_and_preview
from ipc.handlers import build_handlers


def _pcm_digest(path: Path) -> bytes:
    pcm, _sr = sf.read(str(path), dtype="float32", always_2d=True)
    return hashlib.sha256(np.ascontiguousarray(pcm).tobytes()).digest()


def _write_wav(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    n = 4800
    stereo = np.stack(
        [np.full(n, 0.05, dtype=np.float32), np.full(n, -0.05, dtype=np.float32)],
        axis=1,
    )
    sf.write(path, stereo, 48000, subtype="FLOAT")


def _pcm_digest(path: Path) -> bytes:
    pcm, _sr = sf.read(str(path), dtype="float32", always_2d=True)
    return hashlib.sha256(np.ascontiguousarray(pcm).tobytes()).digest()


def test_preview_is_pcm16_and_original_unchanged(tmp_path: Path):
    wav = tmp_path / "h6.wav"
    sr = 48000
    n = sr // 2
    t = np.linspace(0, 0.5, n, endpoint=False)
    left = (0.4 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)
    right = (0.2 * np.sin(2 * np.pi * 330 * t)).astype(np.float32)
    stereo = np.stack([left, right], axis=1)
    sf.write(wav, stereo, sr, subtype="FLOAT")
    before = _pcm_digest(wav)
    result = waveform_and_preview(str(wav), bins=64)
    after = _pcm_digest(wav)
    assert after == before
    preview = Path(result["previewPath"])
    assert preview.is_file()
    info = sf.info(str(preview))
    assert info.subtype == "PCM_16"
    assert info.samplerate == sr
    assert info.channels == 2
    assert len(result["peaksMin"]) == 64
    assert len(result["peaksMax"]) == 64
    assert min(result["peaksMin"]) < 0
    assert max(result["peaksMax"]) > 0
    preview.unlink()


def test_prepare_playback_stays_inside_library(tmp_path: Path):
    library = tmp_path / "library"
    store = ConfigStore(pointer_path=tmp_path / "pointer.json")
    store.save({"libraryRoot": str(library)})
    src = library / "Mixed" / "clip.wav"
    _write_wav(src)
    handlers = build_handlers(store=store)
    result = handlers["prepare_playback"]({"path": str(src)})
    assert result["duration"] > 0
    assert Path(result["previewPath"]).is_file()
    outside = tmp_path / "escape.wav"
    _write_wav(outside)
    with pytest.raises(ValueError, match="outside libraryRoot"):
        handlers["prepare_playback"]({"path": str(outside)})
