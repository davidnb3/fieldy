"""Phase 1: closed AudioSet destinations and persisted library config."""

from pathlib import Path

import pytest

from core.config import (
    ConfigStore,
    YAMNET_CLASS_NAMES,
    assert_legal_destination,
    is_legal_destination,
    merge_and_validate,
    sanitize_class_folder,
)


def test_yamnet_class_map_has_521_names_including_speech():
    assert len(YAMNET_CLASS_NAMES) == 521
    assert "Speech" in YAMNET_CLASS_NAMES


def test_mixed_and_speech_are_legal():
    assert_legal_destination("Mixed")
    assert_legal_destination("Speech")
    quoted = "Child speech, kid speaking"
    assert quoted in YAMNET_CLASS_NAMES
    assert_legal_destination(quoted)
    assert_legal_destination(sanitize_class_folder(quoted))


def test_custom_folder_is_rejected():
    assert not is_legal_destination("My Podcasts")
    with pytest.raises(ValueError, match="not Mixed or an AudioSet class"):
        assert_legal_destination("My Podcasts")


def test_merge_requires_absolute_library_root():
    with pytest.raises(ValueError, match="absolute"):
        merge_and_validate({"libraryRoot": "relative/lib"})
    with pytest.raises(ValueError, match="required"):
        merge_and_validate({})


def test_save_creates_mixed_and_config_file(tmp_path: Path):
    library = tmp_path / "library"
    pointer = tmp_path / "pointer.json"
    store = ConfigStore(pointer_path=pointer)
    assert store.get() == {"needsOnboarding": True}

    result = store.save({"libraryRoot": str(library)})
    assert result["ok"] is True
    assert (library / "Mixed").is_dir()
    assert (library / ".Fieldy.json").is_file()
    assert not (library / "Speech").exists()

    cfg = store.get()
    assert cfg["libraryRoot"] == str(library)
    assert cfg["confidenceThreshold"] == 0.3
    assert cfg["ingestMode"] == "move"
    assert cfg["dropzoneOnLaunch"] is True
    assert "needsOnboarding" not in cfg

    reloaded = ConfigStore(pointer_path=pointer)
    loaded = reloaded.get()
    assert loaded["libraryRoot"] == str(library)
    assert loaded["analyzeChunkSeconds"] == 60


def test_load_accepts_legacy_config_filename(tmp_path: Path):
    import json

    library = tmp_path / "library"
    library.mkdir()
    (library / "Mixed").mkdir()
    payload = {
        "libraryRoot": str(library),
        "confidenceThreshold": 0.3,
        "conflictDelta": 0.15,
        "analyzeChunkSeconds": 60,
    }
    (library / ".soundly-lite.json").write_text(json.dumps(payload) + "\n", encoding="utf-8")
    pointer = tmp_path / "pointer.json"
    pointer.write_text(json.dumps({"libraryRoot": str(library)}) + "\n", encoding="utf-8")
    loaded = ConfigStore(pointer_path=pointer).get()
    assert loaded["libraryRoot"] == str(library)
    assert "needsOnboarding" not in loaded
