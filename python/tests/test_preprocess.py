"""Phase 2: 32-bit float WAV stays untouched; YAMNet sees 16 kHz mono in RAM."""

from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from core.preprocess import (
    PATCH_WINDOW_SECONDS,
    YAMNET_SR,
    audio_info,
    yamnet_waveform,
    yamnet_waveform_chunks,
)


def _write_float32_stereo_48k(path: Path, seconds: float = 0.5) -> np.ndarray:
    sr = 48000
    t = np.linspace(0, seconds, int(sr * seconds), endpoint=False, dtype=np.float64)
    left = (0.25 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    right = (0.05 * np.sin(2 * np.pi * 880 * t)).astype(np.float32)
    stereo = np.stack([left, right], axis=1)
    sf.write(path, stereo, sr, subtype="FLOAT")
    return stereo


def test_audio_info_does_not_need_full_decode(tmp_path: Path):
    wav = tmp_path / "h6.wav"
    stereo = _write_float32_stereo_48k(wav, seconds=0.25)
    info = audio_info(str(wav))
    assert info["samplerate"] == 48000
    assert info["channels"] == 2
    assert info["subtype"] == "FLOAT"
    assert info["format"] == "WAV"
    assert abs(info["duration"] - 0.25) < 1e-4
    assert info["frames"] == stereo.shape[0]


def test_yamnet_waveform_is_16k_mono_float32_and_original_unchanged(tmp_path: Path):
    wav = tmp_path / "h6.wav"
    _write_float32_stereo_48k(wav, seconds=0.5)
    before = hashlib.sha256(wav.read_bytes()).digest()
    neighbors = set(tmp_path.iterdir())

    y = yamnet_waveform(str(wav))

    assert y.dtype == np.float32
    assert y.ndim == 1
    assert abs(y.shape[0] - int(0.5 * YAMNET_SR)) <= 1
    assert float(np.max(np.abs(y))) <= 1.0
    assert hashlib.sha256(wav.read_bytes()).digest() == before
    assert set(tmp_path.iterdir()) == neighbors

    pcm, sr = sf.read(str(wav), dtype="float32", always_2d=True)
    assert sr == 48000
    assert pcm.shape[1] == 2
    assert pcm.dtype == np.float32


def test_stereo_mixdown_averages_channels(tmp_path: Path):
    wav = tmp_path / "lr.wav"
    sr = 48000
    n = sr // 10
    stereo = np.stack(
        [np.ones(n, dtype=np.float32), np.zeros(n, dtype=np.float32)], axis=1
    )
    sf.write(wav, stereo, sr, subtype="FLOAT")
    y = yamnet_waveform(str(wav))
    mid = y[len(y) // 4 : -len(y) // 4]
    assert float(np.mean(mid)) == pytest.approx(0.5, abs=0.02)


def test_chunks_overlap_one_patch_window(tmp_path: Path):
    wav = tmp_path / "longish.wav"
    _write_float32_stereo_48k(wav, seconds=2.5)
    full = yamnet_waveform(str(wav))
    chunks = list(
        yamnet_waveform_chunks(
            str(wav), chunk_seconds=1.0, overlap_seconds=PATCH_WINDOW_SECONDS
        )
    )
    assert len(chunks) >= 2
    assert all(c.dtype == np.float32 and c.ndim == 1 for c in chunks)
    overlap_n = int(round(PATCH_WINDOW_SECONDS * YAMNET_SR))
    hop_n = int(round((1.0 - PATCH_WINDOW_SECONDS) * YAMNET_SR))
    np.testing.assert_array_equal(chunks[0], full[: chunks[0].shape[0]])
    np.testing.assert_array_equal(chunks[1][:overlap_n], full[hop_n : hop_n + overlap_n])


def test_chunk_args_rejected():
    with pytest.raises(ValueError):
        list(yamnet_waveform_chunks("unused.wav", chunk_seconds=1.0, overlap_seconds=1.0))


def _write_float32_stereo(path: Path, *, sr: int, seconds: float) -> None:
    t = np.linspace(0, seconds, int(sr * seconds), endpoint=False, dtype=np.float64)
    left = (0.25 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    right = (0.05 * np.sin(2 * np.pi * 880 * t)).astype(np.float32)
    sf.write(path, np.stack([left, right], axis=1), sr, subtype="FLOAT")


def test_yamnet_waveform_96k_stereo_float32_original_unchanged(tmp_path: Path):
    wav = tmp_path / "h6_96k.wav"
    _write_float32_stereo(wav, sr=96000, seconds=0.5)
    before = hashlib.sha256(wav.read_bytes()).digest()
    neighbors = set(tmp_path.iterdir())

    y = yamnet_waveform(str(wav))

    assert y.dtype == np.float32
    assert y.ndim == 1
    assert abs(y.shape[0] - int(0.5 * YAMNET_SR)) <= 2
    assert hashlib.sha256(wav.read_bytes()).digest() == before
    assert set(tmp_path.iterdir()) == neighbors
    pcm, sr = sf.read(str(wav), dtype="float32", always_2d=True)
    assert sr == 96000
    assert pcm.shape[1] == 2
    assert pcm.dtype == np.float32


def test_streamed_chunks_when_16k_buffer_would_be_huge(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    import core.preprocess as preprocess

    wav = tmp_path / "h6_48k.wav"
    _write_float32_stereo(wav, sr=48000, seconds=2.5)
    before = hashlib.sha256(wav.read_bytes()).digest()
    monkeypatch.setattr(preprocess, "MAX_IN_MEMORY_SAMPLES", 8000)

    chunks = list(
        yamnet_waveform_chunks(
            str(wav), chunk_seconds=1.0, overlap_seconds=PATCH_WINDOW_SECONDS
        )
    )
    assert len(chunks) >= 2
    assert all(c.dtype == np.float32 and c.ndim == 1 for c in chunks)
    assert hashlib.sha256(wav.read_bytes()).digest() == before
