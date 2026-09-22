"""User-facing error strings. Tracebacks stay on stderr."""

from __future__ import annotations

import errno
from pathlib import Path

MISSING_MODEL = "Fieldy is missing its listening model."
MISSING_LIBRARY = "Fieldy can’t find your library folder. Choose it again in Settings, or pick a new folder."
UNREADABLE_LIBRARY = "Fieldy can’t use this library folder. Check that you have permission to read and write it."
NOT_IN_LIBRARY = "This file isn’t in the library folder anymore."
UNSUPPORTED_AUDIO = "Fieldy only adds WAV, AIFF, FLAC, or MP3."
FILE_GONE = "That file isn’t there anymore."
WRITE_DENIED = "Fieldy couldn’t write here. Check the folder’s permissions."
DISK_FULL = "This disk is full, so Fieldy couldn’t save the file."
BACKEND_GENERIC = "Something went wrong. Try again, or pick your library folder in Settings."
CHOOSE_LIBRARY_FIRST = "Choose a library folder first."
MODEL_LOAD_FAILED = "Fieldy couldn’t load its listening model."
NESTED_LIBRARY = "The new library folder can’t be inside the current one, or the other way around."
ILLEGAL_FOLDER = "That folder name isn’t an AudioSet class or Mixed."


def inspect_library_root(library_root: str | None) -> str | None:
    """Return 'missing' or 'unreadable', or None if the folder is usable."""
    if not library_root or not str(library_root).strip():
        return None
    root = Path(library_root).expanduser()
    try:
        if not root.is_dir():
            return "missing"
        next(root.iterdir(), None)
    except PermissionError:
        return "unreadable"
    except OSError as exc:
        if exc.errno in (errno.EACCES, errno.EPERM):
            return "unreadable"
        return "missing"
    try:
        if not _can_use_dir(root):
            return "unreadable"
    except OSError:
        return "unreadable"
    return None


def _can_use_dir(root: Path) -> bool:
    import os

    return os.access(root, os.R_OK | os.W_OK | os.X_OK)


def explain(exc: BaseException) -> str:
    """One-line copy for the UI. Do not mention Zoom or YAMNet."""
    text = str(exc or "").strip()
    lower = text.lower()
    if "library folder unreadable" in lower:
        return UNREADABLE_LIBRARY
    if "libraryroot is not a directory" in lower or "library folder missing" in lower:
        return MISSING_LIBRARY
    if isinstance(exc, PermissionError):
        return WRITE_DENIED
    errno_code = getattr(exc, "errno", None)
    if errno_code == errno.ENOSPC:
        return DISK_FULL
    if errno_code in (errno.EACCES, errno.EPERM):
        return WRITE_DENIED
    if errno_code == errno.EROFS:
        return WRITE_DENIED
    if errno_code == errno.ENOENT or isinstance(exc, FileNotFoundError):
        return FILE_GONE
    if "unsupported audio type" in lower:
        return UNSUPPORTED_AUDIO
    if "path is outside libraryroot" in lower:
        return NOT_IN_LIBRARY
    if "needsonboarding" in lower:
        return CHOOSE_LIBRARY_FIRST
    if "missing its listening model" in lower:
        return MISSING_MODEL
    if "tfhub" in lower or "urlerror" in lower:
        return MODEL_LOAD_FAILED
    if "tensorflow" in lower:
        return MODEL_LOAD_FAILED
    if "cannot be inside the current one" in lower:
        return NESTED_LIBRARY
    if "not mixed or an audioset class" in lower:
        return ILLEGAL_FOLDER
    if "not a file" in lower:
        return FILE_GONE
    if text.startswith("Fieldy ") or text.startswith("Fieldy’"):
        return text
    return BACKEND_GENERIC
