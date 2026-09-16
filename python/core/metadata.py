"""Write classification tags onto the original WAV header. Never rewrite PCM."""

from __future__ import annotations

from mutagen.id3 import COMM, TXXX, Encoding
from mutagen.wave import WAVE

TAG_DESC = "Fieldy"
LEGACY_TAG_DESCS = frozenset({"SoundlyLite"})
_APP_TAG_DESCS = frozenset({TAG_DESC}) | LEGACY_TAG_DESCS


def write_tags(path: str, tags: list[str], comment: str | None = None) -> None:
    """Write Fieldy class names into a WAV ID3 chunk. PCM is left untouched."""
    names = _unique_keep_order(tags)
    wav = WAVE(path)
    if wav.tags is None:
        wav.add_tags()
    _strip_fieldy_frames(wav.tags)
    if names:
        wav.tags.add(TXXX(encoding=Encoding.UTF8, desc=TAG_DESC, text=names))
    note = comment if comment is not None else ", ".join(names)
    if note:
        wav.tags.add(COMM(encoding=Encoding.UTF8, lang="eng", desc=TAG_DESC, text=[note]))
    wav.save()


def read_tags(path: str) -> list[str]:
    wav = WAVE(path)
    if wav.tags is None:
        return []
    for frame in wav.tags.values():
        if isinstance(frame, TXXX) and frame.desc in _APP_TAG_DESCS:
            return [str(part) for part in frame.text if str(part).strip()]
    return []


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
        if getattr(frame, "desc", None) in _APP_TAG_DESCS:
            del tags[key]
