"""Audio types Fieldy can ingest, list, and play. Originals are never transcoded."""

from __future__ import annotations

from pathlib import Path

AUDIO_SUFFIXES = {".wav", ".wave", ".aif", ".aiff", ".flac", ".mp3"}


def is_audio_path(path: str | Path) -> bool:
    return Path(path).suffix.lower() in AUDIO_SUFFIXES
