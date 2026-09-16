"""Temp 16-bit WAV for Chromium playback. Original 32-bit float files stay pristine."""

from __future__ import annotations

import atexit
import os
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

from core.preprocess import audio_info

PEAK_BINS = 1400
_BLOCK = 65536
_cache: dict[tuple[str, int, int], dict] = {}
_temps: list[str] = []


def _forget_temp(path: str) -> None:
    try:
        os.unlink(path)
    except OSError:
        pass


def _cleanup() -> None:
    for path in list(_temps):
        _forget_temp(path)
    _temps.clear()
    _cache.clear()


atexit.register(_cleanup)


def waveform_and_preview(path: str, *, bins: int = PEAK_BINS) -> dict:
    """Write a 16-bit preview in the system temp dir; return peaks for the UI waveform.

    Does not modify `path`. Preview keeps original sample rate and channel count.
    """
    info = audio_info(path)
    resolved = str(Path(path).expanduser().resolve())
    stat = Path(resolved).stat()
    key = (resolved, int(stat.st_mtime_ns), int(stat.st_size))
    cached = _cache.get(key)
    if cached and Path(cached["previewPath"]).is_file():
        return dict(cached)

    frames = max(int(info["frames"]), 1)
    bin_count = max(1, int(bins))
    mins = np.full(bin_count, 1.0, dtype=np.float64)
    maxs = np.full(bin_count, -1.0, dtype=np.float64)
    handle, preview = tempfile.mkstemp(prefix="fieldy-play-", suffix=".wav")
    os.close(handle)
    _temps.append(preview)

    with sf.SoundFile(resolved) as src:
        channels = int(src.channels)
        samplerate = int(src.samplerate)
        with sf.SoundFile(
            preview,
            mode="w",
            samplerate=samplerate,
            channels=channels,
            subtype="PCM_16",
            format="WAV",
        ) as dest:
            pos = 0
            while True:
                block = src.read(_BLOCK, dtype="float32", always_2d=True)
                if block.size == 0:
                    break
                dest.write(np.clip(block, -1.0, 1.0))
                mono = np.mean(block, axis=1)
                n = int(mono.shape[0])
                idx = (np.arange(pos, pos + n, dtype=np.int64) * bin_count) // frames
                np.clip(idx, 0, bin_count - 1, out=idx)
                np.minimum.at(mins, idx, mono)
                np.maximum.at(maxs, idx, mono)
                pos += n

    empty = maxs < mins
    mins[empty] = 0.0
    maxs[empty] = 0.0
    result = {
        "path": resolved,
        "previewPath": preview,
        "duration": float(info["duration"]),
        "samplerate": int(info["samplerate"]),
        "channels": int(info["channels"]),
        "peaksMin": [float(x) for x in mins],
        "peaksMax": [float(x) for x in maxs],
    }
    _cache[key] = result
    return dict(result)
