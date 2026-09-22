"""Download the official YAMNet SavedModel into models/yamnet (offline loads)."""

from __future__ import annotations

import shutil
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

YAMNET_ARCHIVE = "https://tfhub.dev/google/yamnet/1?tf-hub-format=compressed"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def dest_dir() -> Path:
    return repo_root() / "models" / "yamnet"


def _has_model(directory: Path) -> bool:
    return (directory / "saved_model.pb").is_file()


def _unpacked_model_root(extract: Path) -> Path:
    if _has_model(extract):
        return extract
    children = [p for p in extract.iterdir() if p.is_dir()]
    if len(children) == 1 and _has_model(children[0]):
        return children[0]
    raise RuntimeError(f"Archive did not contain saved_model.pb under {extract}")


def fetch(directory: Path | None = None) -> Path:
    target = directory or dest_dir()
    if _has_model(target):
        print(f"Already present: {target}", file=sys.stderr)
        return target

    if target.exists() and any(target.iterdir()):
        raise RuntimeError(f"Refusing to overwrite {target}")

    print(f"Downloading YAMNet to {target} …", file=sys.stderr)
    with tempfile.TemporaryDirectory(prefix="fieldy-yamnet-") as tmp:
        archive = Path(tmp) / "yamnet.tar.gz"
        urllib.request.urlretrieve(YAMNET_ARCHIVE, archive)
        extract = Path(tmp) / "extract"
        extract.mkdir()
        with tarfile.open(archive, "r:*") as tar:
            tar.extractall(extract, filter="data")
        unpacked = _unpacked_model_root(extract)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(unpacked, target)

    if not _has_model(target):
        raise RuntimeError(f"Download finished but {target / 'saved_model.pb'} is missing")
    print(f"Wrote {target}", file=sys.stderr)
    return target


if __name__ == "__main__":
    fetch()
