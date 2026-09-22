"""Phase 4: tags live in the WAV header; 32-bit float PCM must not change."""

from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from core.metadata import read_score, read_tags, write_tags
from core.preprocess import audio_info


def _pcm_fingerprint(path: Path) -> tuple[bytes, dict]:
    pcm, sr = sf.read(str(path), dtype="float32", always_2d=True)
    info = audio_info(str(path))
    digest = hashlib.sha256(np.ascontiguousarray(pcm).tobytes()).digest()
    return digest, {**info, "sr_read": sr, "shape": pcm.shape}


def _write_float32_stereo_48k(path: Path, seconds: float = 0.25) -> None:
    sr = 48000
    t = np.linspace(0, seconds, int(sr * seconds), endpoint=False)
    left = (0.2 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    right = (0.1 * np.sin(2 * np.pi * 880 * t)).astype(np.float32)
    sf.write(path, np.stack([left, right], axis=1), sr, subtype="FLOAT")


def test_write_tags_round_trip_keeps_float32_pcm(tmp_path: Path):
    wav = tmp_path / "h6.wav"
    _write_float32_stereo_48k(wav)
    before, info_before = _pcm_fingerprint(wav)
    assert info_before["subtype"] == "FLOAT"
    assert info_before["channels"] == 2

    tags = ["Pour", "Water", "Trickle, dribble"]
    write_tags(str(wav), tags)

    after, info_after = _pcm_fingerprint(wav)
    assert after == before
    assert info_after["subtype"] == "FLOAT"
    assert info_after["samplerate"] == info_before["samplerate"]
    assert info_after["frames"] == info_before["frames"]
    assert info_after["shape"] == info_before["shape"]
    assert read_tags(str(wav)) == tags


def test_write_tags_stores_score(tmp_path: Path):
    wav = tmp_path / "h6.wav"
    _write_float32_stereo_48k(wav)
    before, _info = _pcm_fingerprint(wav)
    write_tags(str(wav), ["Speech"], score=0.91)
    after, _info_after = _pcm_fingerprint(wav)
    assert after == before
    assert read_tags(str(wav)) == ["Speech"]
    assert read_score(str(wav)) == pytest.approx(0.91, abs=0.0001)


def test_write_tags_replaces_previous_fieldy_tags(tmp_path: Path):
    wav = tmp_path / "h6.wav"
    _write_float32_stereo_48k(wav)
    write_tags(str(wav), ["Speech"])
    write_tags(str(wav), ["Pour", "Water"])
    assert read_tags(str(wav)) == ["Pour", "Water"]


def test_read_tags_accepts_legacy_soundlylite_desc(tmp_path: Path):
    from mutagen.id3 import TXXX, Encoding
    from mutagen.wave import WAVE

    wav = tmp_path / "h6.wav"
    _write_float32_stereo_48k(wav)
    tagged = WAVE(str(wav))
    tagged.add_tags()
    tagged.tags.add(TXXX(encoding=Encoding.UTF8, desc="SoundlyLite", text=["Speech"]))
    tagged.save()
    assert read_tags(str(wav)) == ["Speech"]


def test_read_tags_empty_when_untagged(tmp_path: Path):
    wav = tmp_path / "h6.wav"
    _write_float32_stereo_48k(wav)
    assert read_tags(str(wav)) == []


def _write_tone(path: Path, fmt: str, subtype: str | None = None) -> None:
    sr = 16000
    t = np.linspace(0, 0.2, int(sr * 0.2), endpoint=False)
    tone = (0.15 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    kwargs = {"format": fmt}
    if subtype:
        kwargs["subtype"] = subtype
    sf.write(path, tone, sr, **kwargs)


def test_tags_round_trip_flac_aiff_mp3(tmp_path: Path):
    cases = [
        (tmp_path / "a.flac", "FLAC", "PCM_16"),
        (tmp_path / "a.aiff", "AIFF", "FLOAT"),
        (tmp_path / "a.mp3", "MP3", None),
    ]
    for path, fmt, subtype in cases:
        _write_tone(path, fmt, subtype)
        before, _sr = sf.read(str(path), dtype="float32")
        write_tags(str(path), ["Speech"], score=0.9)
        after, _sr2 = sf.read(str(path), dtype="float32")
        assert read_tags(str(path)) == ["Speech"]
        assert read_score(str(path)) == pytest.approx(0.9, abs=0.0001)
        np.testing.assert_allclose(before, after, atol=1e-3 if fmt == "MP3" else 1e-6)
