"""Write classification tags onto the original file. Never rewrite audio samples."""

from __future__ import annotations

from pathlib import Path

from mutagen.aiff import AIFF
from mutagen.flac import FLAC
from mutagen.id3 import COMM, TXXX, Encoding
from mutagen.mp3 import MP3
from mutagen.wave import WAVE

from core.audio_formats import is_audio_path

TAG_DESC = "Fieldy"
SCORE_DESC = "FieldyScore"
LEGACY_TAG_DESCS = frozenset({"SoundlyLite"})
_APP_TAG_DESCS = frozenset({TAG_DESC}) | LEGACY_TAG_DESCS
_APP_TAG_DESCS_LOWER = frozenset(name.lower() for name in _APP_TAG_DESCS)
_STRIP_DESCS = _APP_TAG_DESCS | {SCORE_DESC}
_FLAC_KEYS = {TAG_DESC.lower(), SCORE_DESC.lower(), "soundlylite"}


def write_tags(
    path: str,
    tags: list[str],
    comment: str | None = None,
    score: float | None = None,
) -> None:
    """Write Fieldy class names onto the original. Samples stay untouched."""
    if not is_audio_path(path):
        raise ValueError(f"unsupported audio type: {path}")
    names = _unique_keep_order(tags)
    note = comment if comment is not None else ", ".join(names)
    suffix = Path(path).suffix.lower()
    if suffix == ".flac":
        _write_flac(path, names, note, score)
        return
    audio = _id3_audio(path)
    if audio.tags is None:
        audio.add_tags()
    _strip_fieldy_frames(audio.tags)
    if names:
        audio.tags.add(TXXX(encoding=Encoding.UTF8, desc=TAG_DESC, text=names))
    if note:
        audio.tags.add(COMM(encoding=Encoding.UTF8, lang="eng", desc=TAG_DESC, text=[note]))
    if score is not None:
        audio.tags.add(
            TXXX(encoding=Encoding.UTF8, desc=SCORE_DESC, text=[f"{float(score):.4f}"])
        )
    audio.save()


def read_tags(path: str) -> list[str]:
    suffix = Path(path).suffix.lower()
    if suffix == ".flac":
        return _read_flac_names(path)
    audio = _id3_audio(path)
    if audio.tags is None:
        return []
    for frame in audio.tags.values():
        if isinstance(frame, TXXX) and frame.desc in _APP_TAG_DESCS:
            return [str(part) for part in frame.text if str(part).strip()]
    return []


def read_score(path: str) -> float | None:
    suffix = Path(path).suffix.lower()
    if suffix == ".flac":
        return _read_flac_score(path)
    audio = _id3_audio(path)
    if audio.tags is None:
        return None
    for frame in audio.tags.values():
        if isinstance(frame, TXXX) and frame.desc == SCORE_DESC:
            try:
                return float(str(frame.text[0]))
            except (IndexError, TypeError, ValueError):
                return None
    return None


def _id3_audio(path: str):
    suffix = Path(path).suffix.lower()
    if suffix in {".wav", ".wave"}:
        return WAVE(path)
    if suffix in {".aif", ".aiff"}:
        return AIFF(path)
    if suffix == ".mp3":
        return MP3(path)
    raise ValueError(f"unsupported audio type: {path}")


def _write_flac(path: str, names: list[str], note: str, score: float | None) -> None:
    audio = FLAC(path)
    for key in list(audio.keys()):
        if key.lower() in _FLAC_KEYS:
            del audio[key]
    if names:
        audio[TAG_DESC] = names
    if note:
        audio["comment"] = [note]
    if score is not None:
        audio[SCORE_DESC] = [f"{float(score):.4f}"]
    audio.save()


def _read_flac_names(path: str) -> list[str]:
    audio = FLAC(path)
    for key in audio.keys():
        if key.lower() in _APP_TAG_DESCS_LOWER:
            return [str(part).strip() for part in audio[key] if str(part).strip()]
    return []


def _read_flac_score(path: str) -> float | None:
    audio = FLAC(path)
    for key in audio.keys():
        if key.lower() == SCORE_DESC.lower():
            try:
                return float(str(audio[key][0]))
            except (IndexError, TypeError, ValueError):
                return None
    return None


def _unique_keep_order(tags: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in tags:
        name = raw.strip()
        if not name or name in seen:
            continue
        seen.add(name)
        out.append(name)
    return out


def _strip_fieldy_frames(tags) -> None:
    for key in list(tags.keys()):
        frame = tags[key]
        if getattr(frame, "desc", None) in _STRIP_DESCS:
            del tags[key]
