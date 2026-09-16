"""In-memory YAMNet prep. Original 32-bit float WAV stays pristine on disk."""

from __future__ import annotations

from collections.abc import Iterator

import numpy as np
import soundfile as sf
import soxr

YAMNET_SR = 16000
PATCH_WINDOW_SECONDS = 0.96
DEFAULT_CHUNK_SECONDS = 60.0
# ~2 hours of 16 kHz mono float32 (~460 MB). Longer files stream from disk.
MAX_IN_MEMORY_SAMPLES = YAMNET_SR * 60 * 120


def audio_info(path: str) -> dict:
    info = sf.info(path)
    return {
        "samplerate": info.samplerate,
        "channels": info.channels,
        "duration": float(info.duration),
        "subtype": info.subtype,
        "format": info.format,
        "frames": int(info.frames),
    }


def yamnet_waveform(path: str) -> np.ndarray:
    """Full-file float32 mono 16 kHz in RAM. Does not write or mutate `path`."""
    with sf.SoundFile(path) as handle:
        audio = handle.read(dtype="float32", always_2d=True)
        native_sr = int(handle.samplerate)
    return _to_yamnet_mono(audio, native_sr)


def yamnet_waveform_chunks(
    path: str,
    chunk_seconds: float = DEFAULT_CHUNK_SECONDS,
    overlap_seconds: float = PATCH_WINDOW_SECONDS,
) -> Iterator[np.ndarray]:
    """Yield 16 kHz mono slices so YAMNet frames can be stitched across long files.

    Overlap one patch window (0.96 s) so no context is dropped at chunk boundaries.
    """
    if chunk_seconds <= 0:
        raise ValueError("chunk_seconds must be > 0")
    if overlap_seconds < 0 or overlap_seconds >= chunk_seconds:
        raise ValueError("overlap_seconds must be >= 0 and < chunk_seconds")

    duration = audio_info(path)["duration"]
    estimated = int(duration * YAMNET_SR)
    if estimated <= MAX_IN_MEMORY_SAMPLES:
        yield from _iter_slices(yamnet_waveform(path), chunk_seconds, overlap_seconds)
        return

    hop = chunk_seconds - overlap_seconds
    offset = 0.0
    while offset < duration:
        chunk = _read_segment_as_yamnet_mono(path, offset, chunk_seconds)
        if chunk.size == 0:
            break
        yield chunk
        if offset + chunk_seconds >= duration:
            break
        offset += hop


def _to_yamnet_mono(audio: np.ndarray, native_sr: int) -> np.ndarray:
    if audio.size == 0:
        return np.zeros(0, dtype=np.float32)
    mono = np.mean(audio, axis=1)
    if native_sr != YAMNET_SR:
        mono = soxr.resample(mono, native_sr, YAMNET_SR)
    return np.asarray(mono, dtype=np.float32)


def _read_segment_as_yamnet_mono(path: str, offset_sec: float, duration_sec: float) -> np.ndarray:
    with sf.SoundFile(path) as handle:
        native_sr = int(handle.samplerate)
        start = int(offset_sec * native_sr)
        frames = int(duration_sec * native_sr)
        if start >= handle.frames:
            return np.zeros(0, dtype=np.float32)
        handle.seek(start)
        audio = handle.read(frames, dtype="float32", always_2d=True)
    return _to_yamnet_mono(audio, native_sr)


def _iter_slices(
    waveform: np.ndarray, chunk_seconds: float, overlap_seconds: float
) -> Iterator[np.ndarray]:
    chunk_n = max(1, int(round(chunk_seconds * YAMNET_SR)))
    hop_n = int(round((chunk_seconds - overlap_seconds) * YAMNET_SR))
    if hop_n <= 0:
        raise ValueError("overlap_seconds must be < chunk_seconds")
    start = 0
    n = int(waveform.shape[0])
    if n == 0:
        return
    while start < n:
        end = min(start + chunk_n, n)
        yield waveform[start:end]
        if end >= n:
            break
        start += hop_n
