"""Phase 4: tags live in the WAV header; 32-bit float PCM must not change."""

from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
import soundfile as sf

from core.metadata import read_tags, write_tags
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
