from pathlib import Path

import pytest

from core.classifier import YamnetClassifier, yamnet_saved_model_marker
from core.config import fieldy_root, yamnet_model_dir


def test_yamnet_model_dir_default_is_under_fieldy_root():
    assert yamnet_model_dir() == fieldy_root() / "models" / "yamnet"


def test_yamnet_model_dir_uses_env(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("FIELDY_YAMNET_DIR", str(tmp_path / "custom-yamnet"))
    assert yamnet_model_dir() == (tmp_path / "custom-yamnet").resolve()


def test_fieldy_root_uses_env(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("FIELDY_ROOT", str(tmp_path))
    assert fieldy_root() == tmp_path.resolve()


def test_load_without_model_raises_before_tensorflow(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("FIELDY_YAMNET_DIR", str(tmp_path))
    with pytest.raises(RuntimeError, match="missing its listening model"):
        YamnetClassifier().load()
    assert not yamnet_saved_model_marker(tmp_path).is_file()
