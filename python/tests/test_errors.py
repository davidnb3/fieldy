from pathlib import Path

from core.errors import (
    BACKEND_GENERIC,
    FILE_GONE,
    MISSING_LIBRARY,
    UNREADABLE_LIBRARY,
    UNSUPPORTED_AUDIO,
    WRITE_DENIED,
    explain,
    inspect_library_root,
)


def test_explain_maps_common_failures():
    assert explain(FileNotFoundError("not a file: /tmp/x.wav")) == FILE_GONE
    assert explain(PermissionError(13, "denied")) == WRITE_DENIED
    assert explain(ValueError("unsupported audio type: /a.txt")) == UNSUPPORTED_AUDIO
    assert explain(ValueError("library folder missing")) == MISSING_LIBRARY
    assert explain(PermissionError("library folder unreadable")) == UNREADABLE_LIBRARY
    assert explain(RuntimeError("/Users/me/Fieldy/python/core/ingest.py")) == BACKEND_GENERIC
    assert explain(ValueError("unexpected keyword argument")) == BACKEND_GENERIC


def test_inspect_missing_and_ok(tmp_path: Path):
    assert inspect_library_root(str(tmp_path / "nope")) == "missing"
    lib = tmp_path / "lib"
    lib.mkdir()
    assert inspect_library_root(str(lib)) is None
